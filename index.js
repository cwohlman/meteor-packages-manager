var exec = require('child_process').exec
	, fs = require('fs')
	, q = require('q')
	, _ = require('underscore')
	, semver = require('semver')
	, readFile = q.denodeify(fs.readFile)
	, writeFile = q.denodeify(fs.writeFile)
	, path = require('path');

exports.versionRegExp = /version:\s*['"]([0-9._-]*)["']/;

exports.writeVersion = function(pathToDescriptor, version) {
	return readFile(pathToDescriptor, 'utf8').then(function (file) {
		file = file.replace(/version:\s*['"]([0-9._-]*)["']/, 'version: "' + version.format() + '"');
		return writeFile(pathToDescriptor, file);
	});
};

exports.publish = function (pathToPackage, options) {
	var shell = function (command) {
		var deferred = q.defer();
		exec(command, {
			cwd: pathToPackage
		}, function (err, stdout, stderr) {
			console.log(stdout);
			console.log(stderr);
			if (err) {
				deferred.reject(err);
			} else {
				deferred.resolve(stdout);
			}
		});
		return deferred.promise;
	}
	;
	options = _.defaults(options || {}, {
		commit: true
		, push: true
		, tag: true
		, publish: true
		, bump: true
	});

	if (options.tag && !options.commit) {
		console.log('Warning --tag option is a no-op without --commit option');
	}

	if (options.push && !options.commit) {
		console.log('Warning --push option is a no-op without --commit option');
	}

	console.log('publishing package: ' + pathToPackage);
	console.log('reading package.js');

	var pathToDescriptor = path.join(pathToPackage, 'package.js')
		, file
		, version
		;
	var promise = readFile(pathToDescriptor, 'utf8');

	// Read package.js and extract version
	promise = promise.then(function (result) {
		file = result;
		version = new semver.SemVer(file.match(exports.versionRegExp)[1]);

		

		if (bumpRelease) {
		}
		return version;
	});

	var bumpRelease = _.find([
			"premajor"
			, "preminor"
			, "prepatch"
			, "prerelease"
			, "major"
			, "minor"
			, "patch"
			, "pre"], function (release) {
				return !!options[release];
			});
	if (bumpRelease) promise = promise.then(function () {
		console.log('found version:' + version.format());
		version.inc(bumpRelease);
		exports.writeVersion(pathToDescriptor, version);
		return version;
	});

	// Publish to meteor package system
	if (options.publish) promise = promise.then(function () {
		console.log('publishing version: ' + version.format());
		return shell('meteor publish', {
			cwd: pathToPackage
		});
	});

	// commit changes
	if (options.commit) promise = promise.then(function () {
		// XXX some way to avoid commiting if no changes detected
		// if we can do that we could allow taging and pushing when no --commit
		// option is specified (we would warn if there are untracked/changed
		// files)
		console.log('commiting published version');
		return shell('git commit --allow-empty -am "Publish version v' + version.format() + '"');
	});

	// tag version
	if (options.commit && options.tag) promise = promise.then(function () {
		console.log('tagging published version');
		return shell('git tag v' + version.format());
	});

	// push commit & tags
	if (options.commit && options.push) {
		promise = promise.then(function () {
			console.log('pushing commits');
			return shell('git push');
		});
		promise = promise.then(function () {
			console.log('pushing tags');
			return shell('git push --tags');
		});
	}

	if (options.bump) promise = promise.then(function () {
		console.log('bumping patch version');
		version.inc('patch');
		return exports.writeVersion(pathToDescriptor, version);
	});

	promise.done(function () {
		console.log('done');
	});
};