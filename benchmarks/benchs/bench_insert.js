var assert = require('assert');

var basechars = '123456789abcdefghijklmnop\\Z';
var chars = basechars.split('');
chars.push('😎');
chars.push('🌶');
chars.push('🎤');
chars.push('🥂');

function randomString(length) {
  var result = '';
  for (var i = length; i > 0; --i) result += chars[Math.round(Math.random() * (chars.length - 1))];
  return result;
}

var sqlTable = 'CREATE TABLE testn.perfTestText (id MEDIUMINT NOT NULL AUTO_INCREMENT,t0 text';
var sqlParam = '';
var sqlCol = 't0';
for (var i = 1; i < 10; i++) {
  sqlParam += ',?';
  sqlCol += ',t' + i;
  sqlTable += ',t' + i + ' text';
}
sqlInsert = 'INSERT INTO testn.perfTestText(' + sqlCol + ') VALUES (?' + sqlParam + ')';
sqlTable += ', PRIMARY KEY (id)) ENGINE = BLACKHOLE';

module.exports.title = 'insert 10 parameters of 100 characters';
module.exports.displaySql =
  'INSERT INTO testn.perfTestText VALUES (<100 ?>) (into BLACKHOLE ENGINE)';

module.exports.benchFct = function(conn, deferred) {
  var params = [];
  for (var i = 0; i < 10; i++) {
    params.push(randomString(10));
  }

  conn.query(sqlInsert, params, function(err, rows) {
    if (err) {
      throw err;
    }
    assert.equal(rows.info ? rows.info.affectedRows : rows.affectedRows, 1);
    deferred.resolve();
  });
};

module.exports.initFct = async function(conn) {
  try {
    await Promise.all([
      conn.query('DROP TABLE IF EXISTS testn.perfTestText'),
      //conn.query('SET max_heap_table_size = 1000000000'),
      conn.query("INSTALL SONAME 'ha_blackhole'"),
      conn.query(sqlTable)
    ]);
  } catch (err) {
    console.log(err);
  }
};

module.exports.onComplete = function(conn) {
  // conn.query('TRUNCATE TABLE testn.perfTestText');
};
