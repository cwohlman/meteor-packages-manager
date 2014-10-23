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
			console.log('bumping ' + bumpRelease + " version: " + version);
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

exports.linkPackages = function (packages, options) {
	var promise
		, gitignorePath = './packages/.gitignore'
		, linkedPackages = './packages/.linkedpackages'
		;
	promise = exports.runSeveral(exports.link, packages, options);

	promise = promise.then(function () {
		if (fs.existsSync(gitignorePath)) return readFile(gitignorePath, 'utf8');
		else return '';
	});
	promise = promise.then(function (file) {
		_.each(packages.concat(['.linkedpackages']), function (a) {
			var name = path.basename(path.resolve(a));
			if (!file.match("^" + name + "$")) {
				file += "\n" + name;
			}
		});
		return writeFile(gitignorePath, file);
	});
	promise = promise.then(function () {
		if (fs.existsSync(linkedPackages)) return readFile(linkedPackages, 'utf8');
		else return '';
	});
	promise = promise.then(function (file) {
		_.each(packages, function (a) {
			var name = path.basename(path.resolve(a));
			if (!file.match("^" + name + "$")) {
				file += "\n" + name;
			}
		});
		return writeFile(linkedPackages, file);
	});
	if (packages.length > 1) promise.then(function () {
		console.log('linked ' + packages.length + ' packages');
	});
	return promise;
};

exports.link = function (pathToPackage, options) {
	// XXX
	// should accept an array
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

	// XXX
	// should update .gitignore
	// should update .linkedpackages

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
		return packageName;
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
	var pathToPackages = path.join(pathToApp, 'packages')
		, pathToLinkedPackages = path.join(pathToPackages, '.linkedpackages')
		, promise = readFile(pathToLinkedPackages, 'utf8')
		;

	promise = promise.then(function (data) {
		var files = _
			.chain(data.split('\n'))
			.map(function (a) {
				return a.trim();
			})
			.filter(_.identity)
			.value()
			;
		return files;
	});

	promise = promise.then(function (files) {
		return exports.updateVersions(
			pathToApp
			, pathToPackages
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
			promise = promise.then(function(result) {
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
	promise = promise.then(function (versions) {
		var pathToMeteorPackages = path.join(pathToApp, '.meteor/packages')
			, promise = readFile(pathToMeteorPackages, 'utf8')
			;
		promise = promise.then(function (file) {
			_.each(versions, function (version, name) {
				var i = file.indexOf(name)
					, lineEnd = file.indexOf('\n', i);

				// replace old version with new version
				if (i != -1) {
					console.log(file.slice(i, lineEnd) + " --> " + version);
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
	console.log('reading packages/.linkedpackages');

	var pathToPackages = path.join(pathToApp, 'packages')
		, pathToLinkedPackages = path.join(pathToPackages, '.linkedpackages')
		, files
		, filesWithPaths
		, promise = readFile(pathToLinkedPackages, 'utf8')
		;


	promise = promise.then(function (data) {
		console.log('publishing package versions');
		files = _
			.chain(data.split('\n'))
			.map(function (a) {
				return a.trim();
			})
			.filter(_.identity)
			.value()
			;
		filesWithPaths = _.map(files, function (a) {
				return path.join(pathToPackages, a);
			});
		return exports.runSeveral(
			exports.publish
			, filesWithPaths
			, options
		);
	});


	promise = promise.then(function () {
		console.log('updating app versions');
		return exports.updateVersions(
			pathToApp
			, pathToPackages
			, files
			, options
			);
	});

	if (options.cleanup) {
		promise = promise.then(function () {
			console.log('cleaning up development packages');
		});
		var pathToGitignore = path.join(pathToPackages, '.gitignore')
			, shell = function (command) {
				var deferred = q.defer();
				exec(command, {
					cwd: pathToPackages
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
			};
		promise = promise.then(function () {
			exports.runSeveral(function (p) {
				console.log('removing ' + p);
				shell('rm ' + p);
			}, files.concat('.linkedpackages'));
		});
		promise = promise.then(function () {
			return readFile(pathToGitignore, 'utf8');
		});
		promise = promise.then(function (file) {
			var re = new RegExp('^\\s*' +
				// escape any regex chars in string eg .
				// http://stackoverflow.com/questions/3446170/escape-string-for-use-in-javascript-regex
				file.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&") +
				"\\s*$");
			_.each(files, function (a) {
				file = file.replace(re, '');
			});
			return writeFile(pathToGitignore, file);
		});
	}

	return promise.then(function () {
		console.log('finished publishing app packages');
	});
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

exports.runSeveral = function (command, paths, options) {
	var promise = q();
	_.each(paths, function (p) {
		promise = promise.then(function () {
			return command(p, options);
		});
	});
	return promise;
};