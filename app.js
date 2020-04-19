const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const mime = require('mime-types').lookup;
const processURL = require('./processURL');
const dirTree = require('./dirTree');

var cwd = path.resolve(process.cwd()).split('\\').join('/');
if (cwd[cwd.length-1] == '/') cwd = cwd.substring(0, cwd.length-1);
var sConfig = require('./defaultConfig.json').server;
if (fs.existsSync('./.ffserve')) {
    try {
        let cfg = JSON.parse(fs.readFileSync('./.ffserve').toString()).server;
        if (cfg) for (let i in cfg) sConfig[i] = cfg[i];
    }
    catch (_e) {}
}

//Checking for sConfig errors
if (isNaN(sConfig.httpPort)) throw Error('Incorrect config: server.httpPort should be number');
if (sConfig.https) {
    if (isNaN(sConfig.https.port)) throw Error('Incorrect config: server.https.port should be number');
    try {
        fs.watchFile(sConfig.https.key, () => initHTTPSServer());
        sConfig.https.key = fs.readFileSync(sConfig.https.key);
        sConfig.https.cert = fs.readFileSync(sConfig.https.cert);
        sConfig.https.ca = fs.readFileSync(sConfig.https.ca);
    }
    catch (e) {
        throw Error('Incorrect config: Error loading SSL information: ' + e.message);
    }
}
/**
 * @type {https.Server}
 */
var httpsServer = null;
if (sConfig.https) initHTTPSServer();
function initHTTPSServer() {
    if (httpsServer) httpsServer.close();
    httpsServer = https.createServer({
        key: sConfig.https.key,
        cert: sConfig.https.cert,
        ca: sConfig.https.ca
    }, processRequest).listen(sConfig.https.port);
    console.log('Started HTTPS server');
}

http.createServer((rq, rp) => {
    if (!sConfig.https || sConfig.https.allowInsecureRequests) processRequest(rq, rp);
    else {
        rp.writeHead(301, { "Location": "https://" + rq.headers['host'] + rq.url }).end();
    }
}).listen(sConfig.httpPort);

/**
 * 
 * @param {http.IncomingMessage} req 
 * @param {http.ServerResponse} res 
 */
function processRequest(req, res) {
    let url = path.join(cwd, req.url).split('\\').join('/').split('%20').join(' ');
    let auth = null;
    if (req.headers.authorization && /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/.test(req.headers.authorization.split(' ')[1])) {
        auth = Buffer.from(req.headers.authorization.split(' ')[1], 'base64').toString('ascii').split(':');
        auth = {
            login: auth[0],
            password: auth[1]
        };
        console.log('Auth:', auth);
    }
    let complete = (code, data, msg, errorPage) => {
        if (errorPage) {
            console.log('Using custom error page', errorPage);
            let errPageResult = processURL(cwd, errorPage, auth);
            if (errPageResult.e == 'output') {
                console.log('Outputting error page', errorPage);
                res.setHeader('Content-Type', errPageResult.mime ? errPageResult.mime : mime(errPageResult.url) || 'application/octet-stream');
                fs.readFile(errPageResult.url, 'utf-8', (err, buf) => {
                    if (err) complete(500, err.message.split(cwd).join('~'), err.message);
                    else complete(code, buf);
                });
                return;
            }
            else console.log('Cannot get custom error page:', errPageResult.e);
        }
        res.statusCode = +code;
        res.end(data);
		const successCodes = [ 200, 301, 304 ];
        console.log(successCodes.indexOf(code) != -1 ? chalk.green(code) : chalk.red(code), `${url.replace(cwd, '~')}${msg ? ` (${msg})` : ''}`);
    };
    let result = processURL(cwd, url, auth);
    console.log('Got result code', result.e);
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
            res.setHeader('Content-Type', result.mime ? result.mime : mime(result.url) || 'application/octet-stream');
            fs.readFile(result.url, 'utf-8', (err, buf) => {
                if (err) complete(500, err.message.split(cwd).join('~'), err.message);
                else complete(200, buf);
            });
            break;
        }
        case 'dirTree': {
            try {
                res.setHeader('Content-type', 'text/html');
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


console.log('FFServe started. Current working directory:', cwd);
console.log('HTTP port: ' + sConfig.httpPort);
sConfig.https ? console.log('HTTPS port: ' + sConfig.https.port) : false;