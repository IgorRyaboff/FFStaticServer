const fs = require('fs');
const path = require('path');
/**
 * 
 * @param {string} cwd
 * @param {string} dir
 * @param {boolean} showConfigFile
 * @param {string} host
 */
function dirTree(cwd, dir, showConfigFile, host) {
    dir = dir.split('\\').join('/');
    let html = `<meta charset="utf-8"/><h1>Index of ${dir.replace(cwd, '~')}</h1>`;
    let readdir = fs.readdirSync(dir).filter(x => showConfigFile || x != '.ffserve');
    let stats = {};
    readdir.forEach(x => {
        try {
            stats[x] = fs.statSync(path.join(dir, x));
        }
        catch (_e) {}
    });
    let dirs = readdir.filter(x => stats[x] && stats[x].isDirectory());
    let files = readdir.filter(x => stats[x] && stats[x].isFile());
    let unknowns = readdir.filter(x => !stats[x]);
    html += `<div>${dirs.length} directories, ${files.length} files, ${unknowns.length} objects are unaccessible</div><hr>`;
    html += `<table></tbody><tr><td>Type</td><td>Name</td><td>Size</td><td>Permissions</td></tr>`;
    readdir = [...dirs, ...files, , ...unknowns];
    if (dir != cwd) html += `<tr><td>[D]</td><td><a href="${path.join(dir, '..').replace(cwd, '')}">..</a></td><td></td></tr>`;
    readdir.forEach(name => {
        if (stats[name]) html += `<tr><td>[${stats[name].isDirectory() ? 'D' : 'F'}]</td><td><a href="${path.join(dir, name).replace(cwd, '')}">${name}</a></td><td>${stats[name].isDirectory() ? '' : (stats[name].size + ' B')}</td><td>${stats[name].mode}</td></tr>`;
        else html += `<tr><td>[?]</td><td>${name}</td><td>?</td><td>?</td></tr>`;
    });
    html += `</tbody></table><hr><div style="font-size:smaller">Powered by <a href="https://github.com/IgorRyaboff/FFServe">FFServe</a></div>`;
    return html;
}
module.exports = dirTree;