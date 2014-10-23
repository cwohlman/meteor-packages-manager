var exec = require('child_process').exec
	, fs = require('fs')
	, q = require('q')
	, _ = require('underscore')
	, semver = require('semver')
	, readFile = q.denodeify(fs.readFile)
	, writeFile = q.denodeify(fs.writeFile)
	, path = require('path');

exports.versionRegExp = /version:\s*['"]([0-9._-]*)["']/;

exports.maybeBumpVersion = function(pathToDescriptor, options) {

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
			}) || 'patch';

	return readFile(pathToDescriptor, 'utf8').then(function (file) {
		version = new semver.SemVer(file.match(exports.versionRegExp)[1]);

		if (options.bump) {
			version.inc(bumpRelease);
			file = file.replace(
				exports.versionRegExp
				, 'version: "' + version.format() + '"'
				);
			return writeFile(pathToDescriptor, file).then(function () {
				return version;
			});
		} else {
			return version;
		}
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
		, packageName = path.basename(path.resolve(pathToPackage))
		, file
		, version
		;

	var promise = exports.maybeBumpVersion(pathToDescriptor, options);

	promise = promise.then(function (result) {
		version = result;
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

	promise.done(function () {
		console.log('published package ' + packageName);
	});
};

exports.link = function (pathToPackage) {
	var shell = function (command) {
		var deferred = q.defer();
		exec(command, function (err, stdout, stderr) {
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

	var packageName = path.basename(path.resolve(pathToPackage))
		, relativePath = path.relative('./packages', pathToPackage)
		, promise = shell('mkdir -p packages')
		;

	promise = promise.then(function () {
		var command = [
			'ln -sh'
			, relativePath
			, path.join('packages', packageName)
			].join(' ');
		return shell(command);
	});

	promise.done(function () {
		console.log('linked package ' + packageName);
	});
};