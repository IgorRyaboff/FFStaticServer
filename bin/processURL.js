const fs = require('fs');
const path = require('path');

/**
 * 
 * @param {string} cwd
 * @param {string} url
 * @param {{ login : string, password : string }|false} auth
 * @param {boolean} verboseLogging
 * @returns { { e : 'output' | 'access' | 'authRequest' | 'notFound' | 'dirTree' | 'externalRedirect' | 'internalError', msg : string } }
 */
function processURL (cwd, url, auth, verboseLogging) {
    let config = JSON.parse(fs.readFileSync(path.join(path.dirname(require.main.filename), '/defaultConfig.json')).toString());
    url = url.split('\\').join('/').replace(cwd, '~').split('/').map(x => x == '~' ? cwd : x).filter(x => !!x);
    if (verboseLogging) console.log('Started processing URL', url);
    if (url[0] != cwd) return {
        e: 'access',
        msg: 'Attempted to escape CWD',
        url: config.errorPages && config.errorPages.access ? path.join(currentPath, config.errorPages.access) : undefined
    };
    for (let i = 0; i < url.length; i++) {
        let currentPath = url.slice(0, i+1).join('/');
        if (verboseLogging) console.log('Processing', currentPath);
        if (config.redirect && config.redirect[url[i]]) {
            let to = config.redirect[url[i]];
			if (to.startsWith('http://') || to.startsWith('https://')) return {
				e: 'externalRedirect',
				url: to
			};
			else return localRedirect(to, currentPath, cwd, auth, verboseLogging);
		}
        if (!fs.existsSync(currentPath)) return {
            e: 'notFound',
            url: config.errorPages && config.errorPages.notFound ? path.join(currentPath, config.errorPages.notFound) : undefined
        };
        let stat;
        try {
            stat = fs.statSync(currentPath);
        }
        catch(e) {
            if (e.code == 'EPERM') return { e: 'access' };
        }
        if (fs.statSync(currentPath).isDirectory()) {
            let thisCfg = connectConfig(currentPath);
            if (thisCfg) {
                for (let i in thisCfg) {
                    if (url[i] == 'auth' && config.auth) continue;
                    else if (url[i] == 'server' && currentPath != cwd) continue;
                    else if (thisCfg[i] === null) config[i] = null;
                    else if (typeof thisCfg[i] == 'object' && !(thisCfg[i] instanceof Array)) {
                        if (!config[i]) config[i] = {};
                        for (let j in thisCfg[i]) config[i][j] = thisCfg[i][j];
                    }
                    else config[i] = thisCfg[i];
                }
                config.redirect = thisCfg.redirect;
                config.mime = thisCfg.mime;
                if (verboseLogging) console.log('Custom config connected', thisCfg);
                if (verboseLogging) console.log('Working with config', config);
            }
            if (config.auth) {
                if (!auth || !config.auth.some(x => x.login == auth.login && x.password == auth.password)) return {
                    e: 'authRequest'
                }
            }
            if (!config.access) return {
                e: 'access',
                msg: '.ffserve > access is false'
            }
            if (!url[i+1]) {
                if (config.index) return localRedirect(path.join(currentPath, config.index), currentPath, cwd, auth, verboseLogging);
                else if (config.showDirectoryTree) return {
                    e: 'dirTree',
                    url: currentPath
                };
                else return {
                    e: 'access',
                    url: config.errorPages && config.errorPages.access ? path.join(currentPath, config.errorPages.access) : undefined
                };
            }
        }
        else {
            if (url[i] == '.ffserve' && !config.configAccess) return {
                e: 'notFound',
				msg: 'Attempted to access .ffserve file',
                url: config.errorPages && config.errorPages.notFound ? path.join(currentPath, config.errorPages.notFound) : undefined
            }
            else return {
                e: 'output',
                url: currentPath,
                mime: config.mime && config.mime[url[i]] ? config.mime[url[i]] : undefined
            }
            break;
        }
    }
}
module.exports = processURL;

function connectConfig(url) {
    if (fs.existsSync(path.join(url, '.ffserve'))) {
        try {
            return JSON.parse(fs.readFileSync(path.join(url, '.ffserve')).toString());
        }
        catch (_e) {
            return false;
        }
    }
    else return false;
}

function localRedirect(to, currentPath, cwd, auth, verboseLogging) {
    if (verboseLogging) console.log('Starting local redirect to', to);
    let newURL = path.join(to).split('\\').join('/');
    if (newURL == currentPath) return {
        e: 'internalError',
        msg: 'Invalid config: recursive redirect at ' + newURL,
        url: config.errorPages && config.errorPages.internalError ? path.join(currentPath, config.errorPages.internalError) : undefined
    }
    else return processURL(cwd, path.join(newURL).split('\\').join('/'), auth, verboseLogging);
}