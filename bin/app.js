const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const mime = require('mime-types').lookup;
const processURL = require('./processURL');
const dirTree = require('./dirTree');

var cwd = path.resolve(process.cwd()).split('\\').join('/');
if (cwd[cwd.length - 1] == '/') cwd = cwd.substring(0, cwd.length - 1);
var sConfig = require('./defaultConfig.json').server;
if (fs.existsSync('./.ffserve')) {
    try {
        let cfg = JSON.parse(fs.readFileSync('./.ffserve').toString()).server;
        if (cfg) for (let i in cfg) sConfig[i] = cfg[i];
    }
    catch (_e) { }
}

//Checking for sConfig errors
var httpsServer = null;
if (isNaN(sConfig.httpPort)) throw Error('Incorrect config: server.httpPort should be number');
if (sConfig.https && sConfig.https.enabled) {
    try {
        if (isNaN(sConfig.https.port)) throw Error('Incorrect config: server.https.port should be number');
        let key = fs.readFileSync(sConfig.https.key);
        let cert = fs.readFileSync(sConfig.https.cert);
        let ca = fs.readFileSync(sConfig.https.ca);
        sConfig.https.key = key;
        sConfig.https.cert = cert;
        sConfig.https.ca = ca;
        initHTTPSServer();
        fs.watchFile(sConfig.https.key, () => initHTTPSServer());
    }
    catch (e) {
        console.error('Error setting up HTTPS: ' + e.message);
    }
}

/**
 * @type {https.Server}
 */
function initHTTPSServer() {
    if (httpsServer) httpsServer.close();
    httpsServer = https.createServer({
        key: sConfig.https.key,
        cert: sConfig.https.cert,
        ca: sConfig.https.ca
    }, processRequest).listen(sConfig.https.port);
    console.log('Started HTTPS server');
}

if (sConfig.httpPort) http.createServer((rq, rp) => {
    if (!httpsServer || sConfig.https.allowInsecureRequests) processRequest(rq, rp);
    else {
        rp.writeHead(301, { "Location": "https://" + rq.headers['host'] + rq.url })
        rp.end();
    }
}).listen(sConfig.httpPort);

/**
 *
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 */
function processRequest(req, res) {
    let url = path.join(cwd, decodeURI(req.url)).split('\\').join('/');
    url = url.substr(0, url.indexOf('?') == -1 ? 10000 : url.indexOf('?'));
    let ifModifiedSince = !isNaN(req.headers['if-modified-since']) ? +req.headers['if-modified-since'] : 0;
    let auth = null;
    if (req.headers.authorization && /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/.test(req.headers.authorization.split(' ')[1])) {
        auth = Buffer.from(req.headers.authorization.split(' ')[1], 'base64').toString('ascii').split(':');
        auth = {
            login: auth[0],
            password: auth[1]
        };
        if (sConfig.verboseLogging) console.log('Auth:', auth);
    }
    let complete = (code, data, msg, errorPage, end = true) => {
        const successCodes = [200, 301, 304];
        if (errorPage) {
            if (sConfig.verboseLogging) console.log('Using custom error page', errorPage);
            let errPageResult = processURL(cwd, errorPage, auth);
            if (errPageResult.e == 'output') {
                if (sConfig.verboseLogging) console.log('Outputting error page', errorPage);
                outputFileContent(errPageResult, res, ifModifiedSince, complete);
                return;
            }
            else if (sConfig.verboseLogging) console.log('Cannot get custom error page:', errPageResult.e);
        }
        else if (successCodes.indexOf(code) == -1 && !data) {
            let codeDescr = {
                403: ['Forbidden', `You don't have permission to access URL ${decodeURI(req.url)} on this server`],
                404: ['Not Found', `The requested URL ${decodeURI(req.url)} was not found on this server`],
                500: ['Internal Error', `Something went wrong on the server. If you're its administrator, see log files`]
            }
            if (codeDescr[code]) {
                res.setHeader('Content-Type', 'text/html');
                data = `<meta charset="utf-8"/><h1>${codeDescr[code][0]}</h1><div>${codeDescr[code][1]}</div><hr><div style="font-size:smaller">Powered by <a href="https://github.com/IgorRyaboff/FFServe">FFServe</a></div>`
            }
        }
        res.statusCode = +code;
        if (end) res.end(data);
        console.log(successCodes.indexOf(code) != -1 ? chalk.green(code) : chalk.red(code), `${url.replace(cwd, '~')}${msg ? ` (${msg})` : ''}`);
    };
    let result = processURL(cwd, url, auth, sConfig.verboseLogging);
    if (sConfig.verboseLogging) console.log('Got result', result);
    switch (result.e) {
        case 'access': {
            complete(403, undefined, result.msg || undefined, result.url);
            break;
        }
        case 'notFound': {
            complete(404, undefined, result.msg || undefined, result.url);
            break;
        }
        case 'authRequest': {
            res.setHeader('WWW-Authenticate', 'Basic realm="You need to authorize in order to access this resource"');
            complete(401, undefined, 'Is auth given: ' + !!auth);
            break;
        }
        case 'output': {
            outputFileContent(result, res, ifModifiedSince, complete);
            break;
        }
        case 'dirTree': {
            try {
                res.setHeader('Content-type', 'text/html');
                res.setHeader('Cache-Control', 'no-cache');
                complete(200, dirTree(cwd, result.url, result.showConfig, req.headers.host), 'Directory tree shown');
            }
            catch (err) {
                complete(500, err.message.split(cwd).join('~'), err.message);
            }
            break;
        }
        case 'externalRedirect': {
            res.setHeader('Location', result.url);
            complete(301, undefined, 'HTTP redirect to ' + result.url);
            break;
        }
        case 'internalError': {
            complete(500, undefined, result.msg || undefined, result.url);
            break;
        }
        default: {
            complete(500, undefined, 'Unknown result.e: ' + result.e);
            break;
        }
    }
}

/**
 *
 * @param {str} url
 * @param {http.ServerResponse} response
 * @param {number} ifModifiedSince
 * @param {function} complete
 */
function outputFileContent(result, response, ifModifiedSince, complete) {
    let stat = fs.statSync(result.url);
    if (+stat.mtime == ifModifiedSince && result.cachingType == 'mtime') return complete(304);
    else {
        response.setHeader('Content-Type', (result.mime ? (result.mime + '; charset=utf-8') : (mime(result.url) + '; charset=utf-8')) || 'application/octet-stream');
        response.setHeader('Content-Length', stat.size);
        switch (result.cachingType) {
            case 'none': break;
            case 'permanent': {
                response.setHeader('Cache-Control', 'max-age=2629743'); // ~ 1 month
                break;
            }
            default: case 'mtime': {
                response.setHeader('Last-Modified', +stat.mtime);
                break;
            }
        }
        fs.createReadStream(result.url).pipe(response);
        complete(200, undefined, undefined, undefined, false);
    }
}

console.log('FFServe started. Current working directory:', cwd);
sConfig.httpPort ? console.log('HTTP port: ' + sConfig.httpPort) : console.log('HTTP is not running');
httpsServer ? console.log('HTTPS port: ' + sConfig.https.port) : console.log('HTTPS is not running');