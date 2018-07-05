const assert = require("assert");

module.exports.title = "select random number using promise";
module.exports.displaySql = "select ?";
module.exports.promise = true;
module.exports.benchFct = function(conn, deferred) {
  conn
    .query("select ?", [1])
    .then(rows => {
      // assert.equal(rand, rows[0].t);
      deferred.resolve();
    })
    .catch(err => {
      throw err;
    });
};
