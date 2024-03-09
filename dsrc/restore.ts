const path = require('path');
const {open} = require('sqlite');
const {Database} = require('sqlite3');


// both paths relative to next root
const DB_FILE = "../insta.db";
const ARCHIVE_ROOT = "../archives/nsfmc_20211226";
const BOOTSTRAP_SQL = "../sql/bootstrap.sql";
