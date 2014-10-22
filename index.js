var exec = require('child_process').exec
	, fs = require('fs')
	, q = require('q')
	, semver = require('semver')
	, readFile = q.denodify(fs.readFile)
	, writeFile = q.denodify(fs.writeFile)
	, shell = q.denodify(exec)
	, path = require('path');
exports.publish = function (pathToPackage) {
	console.log('reading package.js');
	var pathToPackageJS = pathToPackage + "/package.js";
	fs.readFile(pathToPackageJS, {encoding: "utf8"}, function (err, data) {
		if (err) {
			console.log(err);
			return;
		}
		var file = data;
		var version = data.match(/version:\s*['"]([0-9._-]*)["']/)[1];
		console.log('publishing: ' + version);
		exec('meteor publish'
		, function (err, data) {
			console.log(data);
			// if (err && err.code != 1) {
			// 	console.log(err);
			// 	return;
			// }
			console.log('commiting');
			exec('git commit -am "Publish version v' + version + '"'
			, function (err, data) {
				console.log(data);
				if (err) {
					console.log(err);
					return;
				}
				console.log('tagging');
				exec('git tag v' + version
				, function (err, data) {
					console.log(data);
					if (err) {
						console.log(err);
						return;
					}
					console.log('pushing');
					exec('git push --follow-tags'
					, function (err, data) {
						console.log(data);
						if (err) {
							console.log(err);
							return;
						}
						console.log('bumping version');
						var patch = version.split('.');
						patch = Number(patch[patch.length - 1]) + 1;
						version.replace(/\d*$/, patch);
						file = file.replace(/version:\s*['"]([0-9._-]*)["']/, 'version: "' + version + '"');
						fs.writeFile(pathToPackageJS, file, function (err, data) {
							console.log(data);
							if (err) {
								console.log(err);
								return;
							}
							// XXX commit version bump?
							console.log('done!');
						});
					});
				});
			});
		});
	});
};

exports.publish(".");