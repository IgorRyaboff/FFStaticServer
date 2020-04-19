const fs = require('fs');
const path = require('path');

/**
 * 
 * @param {string} cwd
 * @param {string} url
 * @param {{ login : string, password : string }|false} auth
 * @returns { { e : 'output' | 'access' | 'authRequest' | 'notFound' | 'dirTree' | 'externalRedirect', msg : string } }
 */
function processURL (cwd, url, auth) {
    console.log(url);
    let config = JSON.parse(fs.readFileSync(path.join(path.dirname(require.main.filename), '/defaultConfig.json')).toString());
    url = url.split('\\').join('/').replace(cwd, '~').split('/').map(x => x == '~' ? cwd : x);
    console.log('Started processing URL', url);
    if (url[0] != cwd) return {
        e: 'access',
        msg: 'Attempted to escape CWD',
        url: config.errorPages && config.errorPages.access ? path.join(currentPath, config.errorPages.access) : undefined
    };
    for (let i = 0; i < url.length; i++) {
        let currentPath = url.slice(0, i+1).join('/');
        console.log('Processing', currentPath);
        if (config.redirect && config.redirect[url[i]]) {
			let to = config.redirect[url[i]];
			if (to.startsWith('http://') || to.startsWith('https://')) return {
				e: 'externalRedirect',
				url: to
			};
			else return processURL(cwd, path.join(cwd, config.redirect[url[i]]).split('\\').join('/'));
		}
        if (!fs.existsSync(currentPath)) return {
            e: 'notFound',
            url: config.errorPages && config.errorPages.notFound ? path.join(currentPath, config.errorPages.notFound) : undefined
        };
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
                console.log('Custom config connected', thisCfg);
                console.log('Working with config', config);
            }
            if (config.auth) {
                console.log('Authrererre', config.auth);
                if (!auth || !config.auth.some(x => x.login == auth.login && x.password == auth.password)) return {
                    e: 'authRequest'
                }
            }
            if (!url[i+1]) {
                if (config.showDirectoryTree) return {
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