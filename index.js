var exec = require('child_process').exec
	, fs = require('fs')
	, q = require('q')
	, _ = require('underscore')
	, semver = require('semver')
	, existsFile = q.denodeify(fs.exists)
	, readFile = q.denodeify(fs.readFile)
	, readDir = q.denodeify(fs.readdir)
	, writeFile = q.denodeify(fs.writeFile)
	, path = require('path');

exports.versionRegExp = /version:\s*['"]([0-9._-]*)["']/;
exports.nameRegExp = /name:\s*['"](.*)["']/;

exports.maybeBumpVersion = function(pathToDescriptor, options) {
	return readFile(pathToDescriptor, 'utf8').then(function (file) {
		version = new semver.SemVer(file.match(exports.versionRegExp)[1]);

		if (options && options.bump) {	
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
	promise = promise.then(function () {
		console.log('publishing version: ' + version.format());
		return shell('meteor publish', {
			cwd: pathToPackage
		});
	});

	promise = promise.then(function () {
		return exports.commitAndPublish(pathToPackage, version, options);
	});

	return promise.then(function () {
		console.log('published package ' + packageName);
	});
};

exports.commitAndPublish = function (pathToPackage, version, options) {
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
	// commit changes
	if (!options.commit) return;
	
	console.log('commiting published version');
	
	var promise = shell(
		'git commit --allow-empty -am "Publish version v' +
		version.format() +
		'"'
	);

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
	return promise;
};

exports.increment = function (pathToPackage, options) {

	var pathToDescriptor = path.join(pathToPackage, 'package.js')
		, packageName = path.basename(path.resolve(pathToPackage))
		, file
		, version
		;

	var promise = exports.maybeBumpVersion(pathToDescriptor, options);

	promise = promise.then(function (result) {
		version = result;
	});

	promise = promise.then(function () {
		return exports.commitAndPublish(pathToPackage, version, options);
	});

	return promise.then(function () {
		console.log('incremented package ' + packageName);
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

	return promise.then(function () {
		console.log('linked package ' + packageName);
	});
};

exports.publishDir = function (pathToDir, options) {
	var promise = readDir(pathToDir);

	promise = promise.then(function(files) {
		return exports.publishPackages(pathToDir, files, options);
	});

	return promise.then(function () {
		console.log('published all packages in dir');
	});
};

exports.publishPackages = function (pathToDir, files, options) {
	var promise;
	_.each(files, function (file) {
		file = path.join(pathToDir, file);
		if (promise) {
			promise.then(function() {
				return exports.publish(file, options);
			});
		} else {
			promise = exports.publish(file, options);
		}
	});
	return promise;
};

exports.updateApp = function (pathToApp, options) {
	var packagesPath = path.join(pathToApp, 'packages')
		, promise = readDir(packagesPath);

	promise = promise.then(function (files) {
		return exports.updateVersions(
			pathToApp
			, packagesPath
			, files
			, options
		);
	});

	return promise.then(function () {
		console.log('updated app package versions.');
	});
};

exports.updateVersions = function(pathToApp, packagesPath, files, options) {
	var promise;
	_.each(files, function (file) {
		file = path.join(packagesPath, file);
		if (promise) {
			promise.then(function(result) {
				return exports.getNameAndVersion(file, options).then(function (a) {
					result[a.name] = a.version;
					return result;
				});
			});
		} else {
			promise = exports.getNameAndVersion(file, options).then(function (a) {
				var result = {};
				result[a.name] = a.version;
				return result;
			});
		}
	});
	promise.then(function (versions) {
		var pathToMeteorPackages = path.join(pathToApp, '.meteor/packages')
			, promise = readFile(pathToMeteorPackages, 'utf8')
			;
		promise = promise.then(function (file) {
			_.each(versions, function (version, name) {
				var i = file.indexOf(name)
					, lineEnd = file.indexOf('\n', i);

				// replace old version with new version
				if (i != -1) {
					file = file.slice(0, i) +
						name + '@' + version +
						(lineEnd != -1 ? file.slice(lineEnd) : '');
				}
			});
			return writeFile(pathToMeteorPackages, file);
		});

		return promise;
	});
	return promise;	
};

exports.getNameAndVersion = function (pathToPackage, options) {
	var pathToPackageJs = path.join(pathToPackage, 'package.js')
		, promise = readFile(pathToPackageJs, 'utf8')
		;
	promise = promise.then(function (file) {
		var packageName = file.match(exports.nameRegExp)[1]
			, version = file.match(exports.versionRegExp)[1]
			;
		return {
			name: packageName
			, version: version
		};
	});
	return promise;
};

exports.publishApp = function (pathToApp, options) {
	var pathToPackages = path.join(pathToApp, 'packages')
		, promise = exports.publishDir(pathToPackages, options)
		;

	promise = promise.then(function () {
		return exports.updateApp(pathToApp, options);
	});

	return promise;
};

exports.publishAnything = function (pathToDir, options) {
	var pathToMeteorPackages = path.join(pathToDir, '.meteor/packages')
		;

	if (fs.existsSync(pathToMeteorPackages)) {
		return exports.publishApp(pathToDir, options);
	} else {
		return exports.publish(pathToDir, options);
	}
};