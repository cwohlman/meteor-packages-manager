Package.describe({
  summary: "Helper methods to make allow/deny collection rules more powerful."
  , version: "0.1.2"
  , name: "cwohlman:collection-rules"
  , git: "https://github.com/cwohlman/meteor-collection-rules.git"
});
 
Package.on_use(function (api, where) {
  api.versionsFrom("0.9.3");
  api.use(['cwohlman:schema@0.1.0', 'cwohlman:rules@0.1.3', 'underscore', 'mongo']);

  api.add_files('collection-rules.js', ['client', 'server']);

  api.export('CollectionRules');
});

Package.on_test(function (api) {
  api.use('cwohlman:collection-rules');

  api.use(['autopublish', 'cwohlman:schema@0.1.0', 'cwohlman:rules@0.1.2', 'tinytest', 'test-helpers']);

  api.add_files('collection-rules_tests.js', ['client', 'server']);
});
