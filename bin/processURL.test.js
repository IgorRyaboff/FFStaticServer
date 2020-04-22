const assert = require('assert');
const processURL = require('./processURL');
const path = require('path');
const fs = require('fs');
const rimraf = require('rimraf');

describe('processURL middleware', () => {
    it('Gives "output" code and "undefined" mime type when trying to get .testDir/foo.txt directory without auth. No custom config', () => {
        rimraf.sync('./.testDir');
        fs.mkdirSync('./.testDir');
        fs.writeFileSync('./.testDir/foo.txt', '123');
        let result = processURL('./.testDir', './.testDir/foo.txt', false, false);
        rimraf.sync('./.testDir');
        assert.ok(result.e == 'output');
        assert.ok(path.join(result.url) == path.join('./.testDir/foo.txt'));
        assert.ok(typeof result.mime == 'undefined');
    });

    it('Gives "notFound" code and no "url" parameter when trying to get unexsisting .testDir/enoent.txt without auth. No custom config', () => {
        rimraf.sync('./.testDir');
        fs.mkdirSync('./.testDir');
        let result = processURL('./.testDir', './.testDir/enoent.txt', false, false);
        rimraf.sync('./.testDir');
        assert.ok(result.e == 'notFound');
        assert.ok(typeof result.url == 'undefined');
    });

    it('Gives "authRequest" code when trying to get .testDir/foo.txt without auth, but custom config requires auth', () => {
        rimraf.sync('./.testDir');
        fs.mkdirSync('./.testDir');
        fs.writeFileSync('./.testDir/foo.txt', '123');
        fs.writeFileSync('./.testDir/.ffserve', '{ "auth": [ {"login": "admin", "password": "veryStrong"} ] }');
        let result = processURL('./.testDir', './.testDir/foo.txt', false, false);
        rimraf.sync('./.testDir');
        assert.ok(result.e == 'authRequest');
    });

    it('Gives "output" code when trying to get .testDir/foo.txt with correct auth (custom config requires auth)', () => {
        rimraf.sync('./.testDir');
        fs.mkdirSync('./.testDir');
        fs.writeFileSync('./.testDir/foo.txt', '123');
        fs.writeFileSync('./.testDir/.ffserve', '{ "auth": [ {"login": "admin", "password": "veryStrong"} ] }');
        let result = processURL('./.testDir', './.testDir/foo.txt', {
            login: 'admin',
            password: 'veryStrong'
        }, false);
        rimraf.sync('./.testDir');
        assert.ok(result.e == 'output');
    });

    it('Gives "authRequest" code when trying to get .testDir/foo.txt with incorrect auth (custom config requires auth)', () => {
        rimraf.sync('./.testDir');
        fs.mkdirSync('./.testDir');
        fs.writeFileSync('./.testDir/foo.txt', '123');
        fs.writeFileSync('./.testDir/.ffserve', '{ "auth": [ {"login": "admin", "password": "veryStrong"} ] }');
        let result = processURL('./.testDir', './.testDir/foo.txt', {
            login: 'hakker',
            password: 'iam9yo'
        }, false);
        rimraf.sync('./.testDir');
        assert.ok(result.e == 'authRequest');
    });

    it('Gives "authRequest" code when trying to get unexsisting .testDir/foo.txt with incorrect auth (custom config requires auth)', () => {
        rimraf.sync('./.testDir');
        fs.mkdirSync('./.testDir');
        fs.writeFileSync('./.testDir/.ffserve', '{ "auth": [ {"login": "admin", "password": "veryStrong"} ] }');
        let result = processURL('./.testDir', './.testDir/foo.txt', {
            login: 'hakker',
            password: 'iam9yo'
        }, false);
        rimraf.sync('./.testDir');
        assert.ok(result.e == 'authRequest');
    });
});