'use strict';

function _asyncToGenerator(fn) { return function () { var gen = fn.apply(this, arguments); return new Promise(function (resolve, reject) { function step(key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { return Promise.resolve(value).then(function (value) { step("next", value); }, function (err) { step("throw", err); }); } } return step("next"); }); }; }

var async = require('async');
var mysql = require('mysql');
var _ = require('lodash/fp');
var noop = function noop() {};
var logPrefix = '[nodebb-plugin-import-phpbb3.2]';
const http = require('http');
const process = require('process');
const path = require('path');
const fs = require('fs');
const mkdirp = require('mkdirp');

const Exporter = module.exports;

const fixBB = bb => {
  const fixed = bb.replace(/<s>([\w\W]*?)<\/s>/mig, '$1').replace(/<e>([\w\W]*?)<\/e>/mig, '$1').replace(/<U>([\w\W]*?)<\/U>/mig, '$1').replace(/<B>([\w\W]*?)<\/B>/mig, '$1').replace(/<r>([\w\W]*?)<\/r>/mig, '$1').replace(/<t>([\w\W]*?)<\/t>/mig, '$1').replace(/<quote.*?>([\w\W]*)<\/quote>/mig, '$1').replace(/<quote.*?>([\w\W]*)<\/quote>/mig, '$1').replace(/<quote.*?>([\w\W]*)<\/quote>/mig, '$1').replace(/<color.+?>([\w\W]*?)<\/color>/mig, '$1').replace(/<link_text.+?>([\w\W]*?)<\/link_text>/mig, '$1').replace(/<url.+?>([\w\W]*?)<\/url>/mig, '$1').replace(/<emoji.+?>([\w\W]*?)<\/emoji>/mig, '$1').replace(/<attachment.+?>([\w\W]*?)<\/attachment>/mig, '$1').replace(/<!--[^>]+-->/, ''); // html comment
  return fixed;
};

const getFile = (url, output) => new Promise((resolve, reject) => {
  const dest = path.join(process.cwd(), 'public', 'uploads', 'phpbb', output);
  mkdirp(path.dirname(dest), function (err) {
    if (err) return reject(err);

    Exporter.log('Downloading', url, 'to', dest);

    var file = fs.createWriteStream(dest);
    var request = http.get(url, function (response) {
      response.pipe(file);
      file.on('finish', function () {
        file.close(resolve);
      });
    }).on('error', function (err) {
      fs.unlink(dest);
      reject(err.message);
    });
  });
});

const executeQuery = query => new Promise((resolve, reject) => {
  Exporter.connection.query(query, (err, rows) => {
    if (err) return reject(err);
    resolve(rows);
  });
});

Exporter.setup = config => {
  Exporter.log('setup');

  var _config = {
    host: config.dbhost || config.host || 'localhost',
    user: config.dbuser || config.user || 'root',
    password: config.dbpass || config.pass || config.password || '',
    port: config.dbport || config.port || 3306,
    database: config.dbname || config.name || config.database || 'phpbb',
    attachment_url: config.custom ? config.custom.attachment_url : false
  };

  Exporter.config(_config);
  Exporter.config('prefix', config.prefix || config.tablePrefix || '' /* phpbb_ ? */);

  Exporter.connection = mysql.createConnection(_config);
  Exporter.connection.connect();

  return Exporter.config();
};

Exporter.getPaginatedUsers = (() => {
  var _ref = _asyncToGenerator(function* (start, limit) {
    Exporter.log('getPaginatedUsers');
    var err;
    var prefix = Exporter.config('prefix');
    var startms = +new Date();
    var query = 'SELECT ' + prefix + 'users.user_id as _uid, ' + prefix + 'users.username as _username, ' + prefix + 'users.username_clean as _alternativeUsername, ' + prefix + 'users.user_email as _registrationEmail, '
    //+ prefix + 'users.user_rank as _level, '
    + prefix + 'users.user_regdate as _joindate, ' + prefix + 'users.user_posts as _post_count, ' + prefix + 'users.user_email as _email '
    //+ prefix + 'banlist.ban_id as _banned '
    //+ prefix + 'USER_PROFILE.USER_SIGNATURE as _signature, '
    //+ prefix + 'USER_PROFILE.USER_HOMEPAGE as _website, '
    //+ prefix + 'USER_PROFILE.USER_OCCUPATION as _occupation, '
    //+ prefix + 'USER_PROFILE.USER_LOCATION as _location, '
    //+ prefix + 'USER_PROFILE.USER_AVATAR as _picture, '
    //+ prefix + 'USER_PROFILE.USER_TITLE as _title, '
    //+ prefix + 'USER_PROFILE.USER_RATING as _reputation, '
    //+ prefix + 'USER_PROFILE.USER_TOTAL_RATES as _profileviews, '
    //+ prefix + 'USER_PROFILE.USER_BIRTHDAY as _birthday '

    + 'FROM ' + prefix + 'users ' + 'WHERE ' + prefix + 'users.user_id = ' + prefix + 'users.user_id ' + (start >= 0 && limit >= 0 ? 'LIMIT ' + start + ',' + limit : '');

    if (!Exporter.connection) {
      err = { error: 'MySQL connection is not setup. Run setup(config) first' };
      Exporter.error(err.error);
      throw err;
    }

    let rows = yield executeQuery(query);
    rows = rows.filter(function (r) {
      return r._post_count > 0;
    });

    //normalize here
    var map = {};
    rows.forEach(function (row) {
      // nbb forces signatures to be less than 150 chars
      // keeping it HTML see https://github.com/akhoury/nodebb-plugin-import#markdown-note
      row._signature = Exporter.truncateStr(row._signature || '', 150);

      // from unix timestamp (s) to JS timestamp (ms)
      row._joindate = (row._joindate || 0) * 1000 || startms;

      // lower case the email for consistency
      row._email = (row._email || '').toLowerCase();

      // I don't know about you about I noticed a lot my users have incomplete urls, urls like: http://
      row._picture = Exporter.validateUrl(row._picture);
      row._website = Exporter.validateUrl(row._website);

      map[row._uid] = row;
    });

    return map;
  });

  return function (_x, _x2) {
    return _ref.apply(this, arguments);
  };
})();

Exporter.getPaginatedCategories = (() => {
  var _ref2 = _asyncToGenerator(function* (start, limit) {
    Exporter.log('getPaginatedCategories');
    var err;
    var prefix = Exporter.config('prefix');
    var startms = +new Date();
    var query = 'SELECT ' + prefix + 'forums.forum_id as _cid, ' + prefix + 'forums.forum_name as _name, ' + prefix + 'forums.forum_desc as _description, ' + prefix + 'forums.forum_parents as _parentCid ' + 'FROM ' + prefix + 'forums ' + (start >= 0 && limit >= 0 ? 'LIMIT ' + start + ',' + limit : '');

    if (!Exporter.connection) {
      err = { error: 'MySQL connection is not setup. Run setup(config) first' };
      Exporter.error(err.error);
      throw err;
    }

    const rows = yield executeQuery(query);

    //normalize here
    var map = {};
    var _iteratorNormalCompletion = true;
    var _didIteratorError = false;
    var _iteratorError = undefined;

    try {
      for (var _iterator = rows[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
        const row = _step.value;

        row._name = row._name || 'Untitled Category';
        row._description = row._description || '';
        row._timestamp = (row._timestamp || 0) * 1000 || startms;
        try {
          row._parentCid = Number(row._parentCid.split(':')[3].split(';')[0]);
        } catch (e) {
          row._parentCid = undefined;
        }

        map[row._cid] = row;
      }
    } catch (err) {
      _didIteratorError = true;
      _iteratorError = err;
    } finally {
      try {
        if (!_iteratorNormalCompletion && _iterator.return) {
          _iterator.return();
        }
      } finally {
        if (_didIteratorError) {
          throw _iteratorError;
        }
      }
    }

    return map;
  });

  return function (_x3, _x4) {
    return _ref2.apply(this, arguments);
  };
})();

const processAttachments = (() => {
  var _ref3 = _asyncToGenerator(function* (content, pid) {
    const prefix = Exporter.config('prefix');
    let attachments = (yield executeQuery(`
		SELECT * FROM ${prefix}attachments WHERE post_msg_id = ${pid}
	`)).map(function (a) {
      return {
        orig_filename: a.real_filename,
        url: "/uploads/phpbb/" + a.physical_filename + '.' + a.extension
      };
    });
    console.log('processing', attachments);
    var _iteratorNormalCompletion2 = true;
    var _didIteratorError2 = false;
    var _iteratorError2 = undefined;

    try {
      for (var _iterator2 = attachments[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
        const att = _step2.value;

        content = content.replace(new RegExp(`\\[attachment.+\\]${att.orig_filename}\\[/attachment\\]`, 'g'), `![${att.orig_filename}](${att.url})`);
      }
    } catch (err) {
      _didIteratorError2 = true;
      _iteratorError2 = err;
    } finally {
      try {
        if (!_iteratorNormalCompletion2 && _iterator2.return) {
          _iterator2.return();
        }
      } finally {
        if (_didIteratorError2) {
          throw _iteratorError2;
        }
      }
    }

    return content;
  });

  return function processAttachments(_x5, _x6) {
    return _ref3.apply(this, arguments);
  };
})();

Exporter.getPaginatedTopics = (() => {
  var _ref4 = _asyncToGenerator(function* (start, limit) {
    Exporter.log('getPaginatedTopics');
    var err;
    var prefix = Exporter.config('prefix');
    var startms = +new Date();
    var query = 'SELECT ' + prefix + 'topics.topic_id as _tid, ' + prefix + 'topics.forum_id as _cid, '

    // this is the 'parent-post'
    // see https://github.com/akhoury/nodebb-plugin-import#important-note-on-topics-and-posts
    // I don't really need it since I just do a simple join and get its content, but I will include for the reference
    // remember this post EXCLUDED in the exportPosts() function
    + prefix + 'topics.topic_first_post_id as _pid, ' + prefix + 'topics.topic_views as _viewcount, ' + prefix + 'topics.topic_title as _title, ' + prefix + 'topics.topic_time as _timestamp, '

    // maybe use that to skip
    // + prefix + 'topics.topic_approved as _approved, '

    + prefix + 'topics.topic_status as _status, '

    //+ prefix + 'TOPICS.TOPIC_IS_STICKY as _pinned, '
    + prefix + 'posts.poster_id as _uid, '
    // this should be == to the _tid on top of this query
    + prefix + 'posts.topic_id as _post_tid, '

    // and there is the content I need !!
    + prefix + 'posts.post_text as _content ' + 'FROM ' + prefix + 'topics, ' + prefix + 'posts '
    // see
    + 'WHERE ' + prefix + 'topics.topic_first_post_id=' + prefix + 'posts.post_id ' + (start >= 0 && limit >= 0 ? 'LIMIT ' + start + ',' + limit : '');

    if (!Exporter.connection) {
      err = { error: 'MySQL connection is not setup. Run setup(config) first' };
      Exporter.error(err.error);
      throw err;
    }

    const rows = yield executeQuery(query);
    console.log('rows', rows);

    //normalize here
    var map = {};
    let topicCount = 0;
    var _iteratorNormalCompletion3 = true;
    var _didIteratorError3 = false;
    var _iteratorError3 = undefined;

    try {
      for (var _iterator3 = rows[Symbol.iterator](), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true) {
        const row = _step3.value;

        topicCount++;
        Exporter.log(`Topic ${topicCount} out of ${rows.length}`);
        row._content = fixBB(row._content);
        row._content = yield processAttachments(row._content, row._pid);
        console.log(row);

        row._title = row._title ? row._title[0].toUpperCase() + row._title.substr(1) : 'Untitled';
        row._timestamp = (row._timestamp || 0) * 1000 || startms;

        map[row._tid] = row;
      }
    } catch (err) {
      _didIteratorError3 = true;
      _iteratorError3 = err;
    } finally {
      try {
        if (!_iteratorNormalCompletion3 && _iterator3.return) {
          _iterator3.return();
        }
      } finally {
        if (_didIteratorError3) {
          throw _iteratorError3;
        }
      }
    }

    return map;
  });

  return function (_x7, _x8) {
    return _ref4.apply(this, arguments);
  };
})();

var getTopicsMainPids = (() => {
  var _ref5 = _asyncToGenerator(function* () {
    if (Exporter._topicsMainPids) {
      return Exporter._topicsMainPids;
    }
    const topicsMap = yield Exporter.getPaginatedTopics(0, -1);

    Exporter._topicsMainPids = {};
    Object.keys(topicsMap).forEach(function (_tid) {
      var topic = topicsMap[_tid];
      Exporter._topicsMainPids[topic._pid] = topic._tid;
    });
    return Exporter._topicsMainPids;
  });

  return function getTopicsMainPids() {
    return _ref5.apply(this, arguments);
  };
})();

(() => {
  let attachmentsDownloaded = false;
  Exporter.downloadAttachments = _asyncToGenerator(function* () {
    if (!Exporter.config().attachment_url) return;
    if (attachmentsDownloaded) return;
    attachmentsDownloaded = true;
    Exporter.log('Downloading attachments');
    const prefix = Exporter.config('prefix');

    const attachments = yield executeQuery(`
			SELECT * FROM ${prefix}attachments
		`);
    yield Promise.all(attachments.map((() => {
      var _ref7 = _asyncToGenerator(function* (a) {
        return getFile(Exporter.config().attachment_url + a.physical_filename, a.attach_id + '_' + a.real_filename);
      });

      return function (_x9) {
        return _ref7.apply(this, arguments);
      };
    })()));
  });
})();

Exporter.getPaginatedPosts = (() => {
  var _ref8 = _asyncToGenerator(function* (start, limit) {
    Exporter.log('getPaginatedPosts');
    yield Exporter.downloadAttachments();
    var err;
    var prefix = Exporter.config('prefix');
    var startms = +new Date();
    var query = 'SELECT ' + prefix + 'posts.post_id as _pid, '
    //+ 'POST_PARENT_ID as _post_replying_to, ' phpbb doesn't have "reply to another post"
    + prefix + 'posts.topic_id as _tid, ' + prefix + 'posts.post_time as _timestamp, '
    // not being used
    + prefix + 'posts.post_subject as _subject, ' + prefix + 'posts.post_text as _content, ' + prefix + 'posts.poster_id as _uid '

    // maybe use this one to skip
    //+ prefix + 'posts.post_approved as _approved '

    + 'FROM ' + prefix + 'posts '

    // the ones that are topics main posts are filtered below
    + 'WHERE ' + prefix + 'posts.topic_id > 0 ' + (start >= 0 && limit >= 0 ? 'LIMIT ' + start + ',' + limit : '');

    if (!Exporter.connection) {
      err = { error: 'MySQL connection is not setup. Run setup(config) first' };
      Exporter.error(err.error);
      throw err;
    }

    const rows = yield executeQuery(query);
    const mpids = yield getTopicsMainPids();

    //normalize here
    var map = {};
    let currentPostNum = 0;
    var _iteratorNormalCompletion4 = true;
    var _didIteratorError4 = false;
    var _iteratorError4 = undefined;

    try {
      for (var _iterator4 = rows[Symbol.iterator](), _step4; !(_iteratorNormalCompletion4 = (_step4 = _iterator4.next()).done); _iteratorNormalCompletion4 = true) {
        const row = _step4.value;

        currentPostNum++;
        Exporter.log(`Post ${currentPostNum} out of ${rows.length}`);
        // make it's not a topic
        if (!mpids[row._pid]) {
          row._content = fixBB(row._content);
          row._content = yield processAttachments(row._content, row._pid);
          row._timestamp = (row._timestamp || 0) * 1000 || startms;
          map[row._pid] = row;
        }
      }
    } catch (err) {
      _didIteratorError4 = true;
      _iteratorError4 = err;
    } finally {
      try {
        if (!_iteratorNormalCompletion4 && _iterator4.return) {
          _iterator4.return();
        }
      } finally {
        if (_didIteratorError4) {
          throw _iteratorError4;
        }
      }
    }

    return map;
  });

  return function (_x10, _x11) {
    return _ref8.apply(this, arguments);
  };
})();

Exporter.teardown = () => {
  Exporter.log('teardown');
  Exporter.connection.end();

  Exporter.log('Done');
};

Exporter.paginatedTestrun = (() => {
  var _ref9 = _asyncToGenerator(function* (config) {
    Exporter.setup(config);
    Exporter.getPaginatedUsers(0, 1000);
    Exporter.getPaginatedCategories(0, 1000);
    Exporter.getPaginatedTopics(0, 1000);
    Exporter.getPaginatedPosts(1001, 2000);
    Exporter.teardown();
  });

  return function (_x12) {
    return _ref9.apply(this, arguments);
  };
})();

Exporter.warn = function () {
  var args = _.toArray(arguments);
  args.unshift(logPrefix);
  console.warn.apply(console, args);
};

Exporter.log = function () {
  var args = _.toArray(arguments);
  args.unshift(logPrefix);
  console.log.apply(console, args);
};

Exporter.error = function () {
  var args = _.toArray(arguments);
  args.unshift(logPrefix);
  console.error.apply(console, args);
};

Exporter.config = function (config, val) {
  if (config != null) {
    if (typeof config === 'object') {
      Exporter._config = config;
    } else if (typeof config === 'string') {
      if (val != null) {
        Exporter._config = Exporter._config || {};
        Exporter._config[config] = val;
      }
      return Exporter._config[config];
    }
  }
  return Exporter._config;
};

// from Angular https://github.com/angular/angular.js/blob/master/src/ng/directive/input.js#L11
Exporter.validateUrl = function (url) {
  var pattern = /^(ftp|http|https):\/\/(\w+:{0,1}\w*@)?(\S+)(:[0-9]+)?(\/|\/([\w#!:.?+=&%@!\-\/]))?$/;
  return url && url.length < 2083 && url.match(pattern) ? url : '';
};

Exporter.truncateStr = function (str, len) {
  if (typeof str != 'string') return str;
  len = _.isNumber(len) && len > 3 ? len : 20;
  return str.length <= len ? str : str.substr(0, len - 3) + '...';
};

Exporter.whichIsFalsy = function (arr) {
  for (var i = 0; i < arr.length; i++) {
    if (!arr[i]) return i;
  }
  return null;
};
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9pbmRleC5qcyJdLCJuYW1lcyI6WyJhc3luYyIsInJlcXVpcmUiLCJteXNxbCIsIl8iLCJub29wIiwibG9nUHJlZml4IiwiaHR0cCIsInByb2Nlc3MiLCJwYXRoIiwiZnMiLCJta2RpcnAiLCJFeHBvcnRlciIsIm1vZHVsZSIsImV4cG9ydHMiLCJmaXhCQiIsImJiIiwiZml4ZWQiLCJyZXBsYWNlIiwiZ2V0RmlsZSIsInVybCIsIm91dHB1dCIsIlByb21pc2UiLCJyZXNvbHZlIiwicmVqZWN0IiwiZGVzdCIsImpvaW4iLCJjd2QiLCJkaXJuYW1lIiwiZXJyIiwibG9nIiwiZmlsZSIsImNyZWF0ZVdyaXRlU3RyZWFtIiwicmVxdWVzdCIsImdldCIsInJlc3BvbnNlIiwicGlwZSIsIm9uIiwiY2xvc2UiLCJ1bmxpbmsiLCJtZXNzYWdlIiwiZXhlY3V0ZVF1ZXJ5IiwicXVlcnkiLCJjb25uZWN0aW9uIiwicm93cyIsInNldHVwIiwiY29uZmlnIiwiX2NvbmZpZyIsImhvc3QiLCJkYmhvc3QiLCJ1c2VyIiwiZGJ1c2VyIiwicGFzc3dvcmQiLCJkYnBhc3MiLCJwYXNzIiwicG9ydCIsImRicG9ydCIsImRhdGFiYXNlIiwiZGJuYW1lIiwibmFtZSIsImF0dGFjaG1lbnRfdXJsIiwiY3VzdG9tIiwicHJlZml4IiwidGFibGVQcmVmaXgiLCJjcmVhdGVDb25uZWN0aW9uIiwiY29ubmVjdCIsImdldFBhZ2luYXRlZFVzZXJzIiwic3RhcnQiLCJsaW1pdCIsInN0YXJ0bXMiLCJEYXRlIiwiZXJyb3IiLCJmaWx0ZXIiLCJyIiwiX3Bvc3RfY291bnQiLCJtYXAiLCJmb3JFYWNoIiwicm93IiwiX3NpZ25hdHVyZSIsInRydW5jYXRlU3RyIiwiX2pvaW5kYXRlIiwiX2VtYWlsIiwidG9Mb3dlckNhc2UiLCJfcGljdHVyZSIsInZhbGlkYXRlVXJsIiwiX3dlYnNpdGUiLCJfdWlkIiwiZ2V0UGFnaW5hdGVkQ2F0ZWdvcmllcyIsIl9uYW1lIiwiX2Rlc2NyaXB0aW9uIiwiX3RpbWVzdGFtcCIsIl9wYXJlbnRDaWQiLCJOdW1iZXIiLCJzcGxpdCIsImUiLCJ1bmRlZmluZWQiLCJfY2lkIiwicHJvY2Vzc0F0dGFjaG1lbnRzIiwiY29udGVudCIsInBpZCIsImF0dGFjaG1lbnRzIiwib3JpZ19maWxlbmFtZSIsImEiLCJyZWFsX2ZpbGVuYW1lIiwicGh5c2ljYWxfZmlsZW5hbWUiLCJleHRlbnNpb24iLCJjb25zb2xlIiwiYXR0IiwiUmVnRXhwIiwiZ2V0UGFnaW5hdGVkVG9waWNzIiwidG9waWNDb3VudCIsImxlbmd0aCIsIl9jb250ZW50IiwiX3BpZCIsIl90aXRsZSIsInRvVXBwZXJDYXNlIiwic3Vic3RyIiwiX3RpZCIsImdldFRvcGljc01haW5QaWRzIiwiX3RvcGljc01haW5QaWRzIiwidG9waWNzTWFwIiwiT2JqZWN0Iiwia2V5cyIsInRvcGljIiwiYXR0YWNobWVudHNEb3dubG9hZGVkIiwiZG93bmxvYWRBdHRhY2htZW50cyIsImFsbCIsImF0dGFjaF9pZCIsImdldFBhZ2luYXRlZFBvc3RzIiwibXBpZHMiLCJjdXJyZW50UG9zdE51bSIsInRlYXJkb3duIiwiZW5kIiwicGFnaW5hdGVkVGVzdHJ1biIsIndhcm4iLCJhcmdzIiwidG9BcnJheSIsImFyZ3VtZW50cyIsInVuc2hpZnQiLCJhcHBseSIsInZhbCIsInBhdHRlcm4iLCJtYXRjaCIsInN0ciIsImxlbiIsImlzTnVtYmVyIiwid2hpY2hJc0ZhbHN5IiwiYXJyIiwiaSJdLCJtYXBwaW5ncyI6Ijs7OztBQUFBLElBQUlBLFFBQVFDLFFBQVEsT0FBUixDQUFaO0FBQ0EsSUFBSUMsUUFBUUQsUUFBUSxPQUFSLENBQVo7QUFDQSxJQUFJRSxJQUFJRixRQUFRLFdBQVIsQ0FBUjtBQUNBLElBQUlHLE9BQU8sU0FBUEEsSUFBTyxHQUFZLENBQUcsQ0FBMUI7QUFDQSxJQUFJQyxZQUFZLGlDQUFoQjtBQUNBLE1BQU1DLE9BQU9MLFFBQVEsTUFBUixDQUFiO0FBQ0EsTUFBTU0sVUFBVU4sUUFBUSxTQUFSLENBQWhC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QUFwQixJQUF5QixLQUExRDtBQUNELENBSkQ7O0FBTUFwSSxTQUFTc0ksWUFBVCxHQUF3QixVQUFVQyxHQUFWLEVBQWU7QUFDckMsT0FBSyxJQUFJQyxJQUFJLENBQWIsRUFBZ0JBLElBQUlELElBQUlwQyxNQUF4QixFQUFnQ3FDLEdBQWhDLEVBQXFDO0FBQ25DLFFBQUksQ0FBQ0QsSUFBSUMsQ0FBSixDQUFMLEVBQ0UsT0FBT0EsQ0FBUDtBQUNIO0FBQ0QsU0FBTyxJQUFQO0FBQ0QsQ0FORCIsImZpbGUiOiJpbmRleC5qcyIsInNvdXJjZXNDb250ZW50IjpbInZhciBhc3luYyA9IHJlcXVpcmUoJ2FzeW5jJyk7XG52YXIgbXlzcWwgPSByZXF1aXJlKCdteXNxbCcpO1xudmFyIF8gPSByZXF1aXJlKCdsb2Rhc2gvZnAnKTtcbnZhciBub29wID0gZnVuY3Rpb24gKCkgeyB9O1xudmFyIGxvZ1ByZWZpeCA9ICdbbm9kZWJiLXBsdWdpbi1pbXBvcnQtcGhwYmIzLjJdJztcbmNvbnN0IGh0dHAgPSByZXF1aXJlKCdodHRwJylcbmNvbnN0IHByb2Nlc3MgPSByZXF1aXJlKCdwcm9jZXNzJylcbmNvbnN0IHBhdGggPSByZXF1aXJlKCdwYXRoJylcbmNvbnN0IGZzID0gcmVxdWlyZSgnZnMnKVxuY29uc3QgbWtkaXJwID0gcmVxdWlyZSgnbWtkaXJwJylcblxuY29uc3QgRXhwb3J0ZXIgPSBtb2R1bGUuZXhwb3J0c1xuXG5jb25zdCBmaXhCQiA9IChiYikgPT4ge1xuICBjb25zdCBmaXhlZCA9IGJiXG4gICAgLnJlcGxhY2UoLzxzPihbXFx3XFxXXSo/KTxcXC9zPi9taWcsICckMScpXG4gICAgLnJlcGxhY2UoLzxlPihbXFx3XFxXXSo/KTxcXC9lPi9taWcsICckMScpXG4gICAgLnJlcGxhY2UoLzxVPihbXFx3XFxXXSo/KTxcXC9VPi9taWcsICckMScpXG4gICAgLnJlcGxhY2UoLzxCPihbXFx3XFxXXSo/KTxcXC9CPi9taWcsICckMScpXG4gICAgLnJlcGxhY2UoLzxyPihbXFx3XFxXXSo/KTxcXC9yPi9taWcsICckMScpXG4gICAgLnJlcGxhY2UoLzx0PihbXFx3XFxXXSo/KTxcXC90Pi9taWcsICckMScpXG4gICAgLnJlcGxhY2UoLzxxdW90ZS4qPz4oW1xcd1xcV10qKTxcXC9xdW90ZT4vbWlnLCAnJDEnKVxuICAgIC5yZXBsYWNlKC88cXVvdGUuKj8+KFtcXHdcXFddKik8XFwvcXVvdGU+L21pZywgJyQxJylcbiAgICAucmVwbGFjZSgvPHF1b3RlLio/PihbXFx3XFxXXSopPFxcL3F1b3RlPi9taWcsICckMScpXG4gICAgLnJlcGxhY2UoLzxjb2xvci4rPz4oW1xcd1xcV10qPyk8XFwvY29sb3I+L21pZywgJyQxJylcbiAgICAucmVwbGFjZSgvPGxpbmtfdGV4dC4rPz4oW1xcd1xcV10qPyk8XFwvbGlua190ZXh0Pi9taWcsICckMScpXG4gICAgLnJlcGxhY2UoLzx1cmwuKz8+KFtcXHdcXFddKj8pPFxcL3VybD4vbWlnLCAnJDEnKVxuICAgIC5yZXBsYWNlKC88ZW1vamkuKz8+KFtcXHdcXFddKj8pPFxcL2Vtb2ppPi9taWcsICckMScpXG4gICAgLnJlcGxhY2UoLzxhdHRhY2htZW50Lis/PihbXFx3XFxXXSo/KTxcXC9hdHRhY2htZW50Pi9taWcsICckMScpXG4gICAgLnJlcGxhY2UoLzwhLS1bXj5dKy0tPi8sICcnKSAvLyBodG1sIGNvbW1lbnRcbiAgcmV0dXJuIGZpeGVkXG59XG5cbmNvbnN0IGdldEZpbGUgPSAodXJsLCBvdXRwdXQpID0+IG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgY29uc3QgZGVzdCA9IHBhdGguam9pbihwcm9jZXNzLmN3ZCgpLCAncHVibGljJywgJ3VwbG9hZHMnLCAncGhwYmInLCBvdXRwdXQpXG4gIG1rZGlycChwYXRoLmRpcm5hbWUoZGVzdCksIGZ1bmN0aW9uIChlcnIpIHtcbiAgICBpZiAoZXJyKSByZXR1cm4gcmVqZWN0KGVycilcblxuICAgIEV4cG9ydGVyLmxvZygnRG93bmxvYWRpbmcnLCB1cmwsICd0bycsIGRlc3QpXG5cbiAgICB2YXIgZmlsZSA9IGZzLmNyZWF0ZVdyaXRlU3RyZWFtKGRlc3QpO1xuICAgIHZhciByZXF1ZXN0ID0gaHR0cC5nZXQodXJsLCBmdW5jdGlvbiAocmVzcG9uc2UpIHtcbiAgICAgIHJlc3BvbnNlLnBpcGUoZmlsZSk7XG4gICAgICBmaWxlLm9uKCdmaW5pc2gnLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGZpbGUuY2xvc2UocmVzb2x2ZSk7XG4gICAgICB9KVxuICAgIH0pLm9uKCdlcnJvcicsIGZ1bmN0aW9uIChlcnIpIHtcbiAgICAgIGZzLnVubGluayhkZXN0KTtcbiAgICAgIHJlamVjdChlcnIubWVzc2FnZSlcbiAgICB9KVxuICB9KTtcbn0pXG5cbmNvbnN0IGV4ZWN1dGVRdWVyeSA9IChxdWVyeSkgPT4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICBFeHBvcnRlci5jb25uZWN0aW9uLnF1ZXJ5KHF1ZXJ5LCAoZXJyLCByb3dzKSA9PiB7XG4gICAgaWYgKGVycikgcmV0dXJuIHJlamVjdChlcnIpXG4gICAgcmVzb2x2ZShyb3dzKVxuICB9KTtcbn0pXG5cbkV4cG9ydGVyLnNldHVwID0gKGNvbmZpZykgPT4ge1xuICBFeHBvcnRlci5sb2coJ3NldHVwJyk7XG5cbiAgdmFyIF9jb25maWcgPSB7XG4gICAgaG9zdDogY29uZmlnLmRiaG9zdCB8fCBjb25maWcuaG9zdCB8fCAnbG9jYWxob3N0JyxcbiAgICB1c2VyOiBjb25maWcuZGJ1c2VyIHx8IGNvbmZpZy51c2VyIHx8ICdyb290JyxcbiAgICBwYXNzd29yZDogY29uZmlnLmRicGFzcyB8fCBjb25maWcucGFzcyB8fCBjb25maWcucGFzc3dvcmQgfHwgJycsXG4gICAgcG9ydDogY29uZmlnLmRicG9ydCB8fCBjb25maWcucG9ydCB8fCAzMzA2LFxuICAgIGRhdGFiYXNlOiBjb25maWcuZGJuYW1lIHx8IGNvbmZpZy5uYW1lIHx8IGNvbmZpZy5kYXRhYmFzZSB8fCAncGhwYmInLFxuICAgIGF0dGFjaG1lbnRfdXJsOiBjb25maWcuY3VzdG9tID8gY29uZmlnLmN1c3RvbS5hdHRhY2htZW50X3VybCA6IGZhbHNlLFxuICB9O1xuXG4gIEV4cG9ydGVyLmNvbmZpZyhfY29uZmlnKTtcbiAgRXhwb3J0ZXIuY29uZmlnKCdwcmVmaXgnLCBjb25maWcucHJlZml4IHx8IGNvbmZpZy50YWJsZVByZWZpeCB8fCAnJyAvKiBwaHBiYl8gPyAqLyk7XG5cbiAgRXhwb3J0ZXIuY29ubmVjdGlvbiA9IG15c3FsLmNyZWF0ZUNvbm5lY3Rpb24oX2NvbmZpZyk7XG4gIEV4cG9ydGVyLmNvbm5lY3Rpb24uY29ubmVjdCgpO1xuXG4gIHJldHVybiBFeHBvcnRlci5jb25maWcoKVxufVxuXG5FeHBvcnRlci5nZXRQYWdpbmF0ZWRVc2VycyA9IGFzeW5jIChzdGFydCwgbGltaXQpID0+IHtcbiAgRXhwb3J0ZXIubG9nKCdnZXRQYWdpbmF0ZWRVc2VycycpXG4gIHZhciBlcnI7XG4gIHZhciBwcmVmaXggPSBFeHBvcnRlci5jb25maWcoJ3ByZWZpeCcpO1xuICB2YXIgc3RhcnRtcyA9ICtuZXcgRGF0ZSgpO1xuICB2YXIgcXVlcnkgPSAnU0VMRUNUICdcbiAgICArIHByZWZpeCArICd1c2Vycy51c2VyX2lkIGFzIF91aWQsICdcbiAgICArIHByZWZpeCArICd1c2Vycy51c2VybmFtZSBhcyBfdXNlcm5hbWUsICdcbiAgICArIHByZWZpeCArICd1c2Vycy51c2VybmFtZV9jbGVhbiBhcyBfYWx0ZXJuYXRpdmVVc2VybmFtZSwgJ1xuICAgICsgcHJlZml4ICsgJ3VzZXJzLnVzZXJfZW1haWwgYXMgX3JlZ2lzdHJhdGlvbkVtYWlsLCAnXG4gICAgLy8rIHByZWZpeCArICd1c2Vycy51c2VyX3JhbmsgYXMgX2xldmVsLCAnXG4gICAgKyBwcmVmaXggKyAndXNlcnMudXNlcl9yZWdkYXRlIGFzIF9qb2luZGF0ZSwgJ1xuICAgICsgcHJlZml4ICsgJ3VzZXJzLnVzZXJfcG9zdHMgYXMgX3Bvc3RfY291bnQsICdcbiAgICArIHByZWZpeCArICd1c2Vycy51c2VyX2VtYWlsIGFzIF9lbWFpbCAnXG4gICAgLy8rIHByZWZpeCArICdiYW5saXN0LmJhbl9pZCBhcyBfYmFubmVkICdcbiAgICAvLysgcHJlZml4ICsgJ1VTRVJfUFJPRklMRS5VU0VSX1NJR05BVFVSRSBhcyBfc2lnbmF0dXJlLCAnXG4gICAgLy8rIHByZWZpeCArICdVU0VSX1BST0ZJTEUuVVNFUl9IT01FUEFHRSBhcyBfd2Vic2l0ZSwgJ1xuICAgIC8vKyBwcmVmaXggKyAnVVNFUl9QUk9GSUxFLlVTRVJfT0NDVVBBVElPTiBhcyBfb2NjdXBhdGlvbiwgJ1xuICAgIC8vKyBwcmVmaXggKyAnVVNFUl9QUk9GSUxFLlVTRVJfTE9DQVRJT04gYXMgX2xvY2F0aW9uLCAnXG4gICAgLy8rIHByZWZpeCArICdVU0VSX1BST0ZJTEUuVVNFUl9BVkFUQVIgYXMgX3BpY3R1cmUsICdcbiAgICAvLysgcHJlZml4ICsgJ1VTRVJfUFJPRklMRS5VU0VSX1RJVExFIGFzIF90aXRsZSwgJ1xuICAgIC8vKyBwcmVmaXggKyAnVVNFUl9QUk9GSUxFLlVTRVJfUkFUSU5HIGFzIF9yZXB1dGF0aW9uLCAnXG4gICAgLy8rIHByZWZpeCArICdVU0VSX1BST0ZJTEUuVVNFUl9UT1RBTF9SQVRFUyBhcyBfcHJvZmlsZXZpZXdzLCAnXG4gICAgLy8rIHByZWZpeCArICdVU0VSX1BST0ZJTEUuVVNFUl9CSVJUSERBWSBhcyBfYmlydGhkYXkgJ1xuXG4gICAgKyAnRlJPTSAnICsgcHJlZml4ICsgJ3VzZXJzICdcbiAgICArICdXSEVSRSAnICsgcHJlZml4ICsgJ3VzZXJzLnVzZXJfaWQgPSAnICsgcHJlZml4ICsgJ3VzZXJzLnVzZXJfaWQgJ1xuICAgICsgKHN0YXJ0ID49IDAgJiYgbGltaXQgPj0gMCA/ICdMSU1JVCAnICsgc3RhcnQgKyAnLCcgKyBsaW1pdCA6ICcnKTtcblxuXG4gIGlmICghRXhwb3J0ZXIuY29ubmVjdGlvbikge1xuICAgIGVyciA9IHsgZXJyb3I6ICdNeVNRTCBjb25uZWN0aW9uIGlzIG5vdCBzZXR1cC4gUnVuIHNldHVwKGNvbmZpZykgZmlyc3QnIH07XG4gICAgRXhwb3J0ZXIuZXJyb3IoZXJyLmVycm9yKTtcbiAgICB0aHJvdyBlcnJcbiAgfVxuXG4gIGxldCByb3dzID0gYXdhaXQgZXhlY3V0ZVF1ZXJ5KHF1ZXJ5KVxuICByb3dzID0gcm93cy5maWx0ZXIociA9PiByLl9wb3N0X2NvdW50ID4gMClcblxuICAvL25vcm1hbGl6ZSBoZXJlXG4gIHZhciBtYXAgPSB7fTtcbiAgcm93cy5mb3JFYWNoKGZ1bmN0aW9uIChyb3cpIHtcbiAgICAvLyBuYmIgZm9yY2VzIHNpZ25hdHVyZXMgdG8gYmUgbGVzcyB0aGFuIDE1MCBjaGFyc1xuICAgIC8vIGtlZXBpbmcgaXQgSFRNTCBzZWUgaHR0cHM6Ly9naXRodWIuY29tL2FraG91cnkvbm9kZWJiLXBsdWdpbi1pbXBvcnQjbWFya2Rvd24tbm90ZVxuICAgIHJvdy5fc2lnbmF0dXJlID0gRXhwb3J0ZXIudHJ1bmNhdGVTdHIocm93Ll9zaWduYXR1cmUgfHwgJycsIDE1MCk7XG5cbiAgICAvLyBmcm9tIHVuaXggdGltZXN0YW1wIChzKSB0byBKUyB0aW1lc3RhbXAgKG1zKVxuICAgIHJvdy5fam9pbmRhdGUgPSAoKHJvdy5fam9pbmRhdGUgfHwgMCkgKiAxMDAwKSB8fCBzdGFydG1zO1xuXG4gICAgLy8gbG93ZXIgY2FzZSB0aGUgZW1haWwgZm9yIGNvbnNpc3RlbmN5XG4gICAgcm93Ll9lbWFpbCA9IChyb3cuX2VtYWlsIHx8ICcnKS50b0xvd2VyQ2FzZSgpO1xuXG4gICAgLy8gSSBkb24ndCBrbm93IGFib3V0IHlvdSBhYm91dCBJIG5vdGljZWQgYSBsb3QgbXkgdXNlcnMgaGF2ZSBpbmNvbXBsZXRlIHVybHMsIHVybHMgbGlrZTogaHR0cDovL1xuICAgIHJvdy5fcGljdHVyZSA9IEV4cG9ydGVyLnZhbGlkYXRlVXJsKHJvdy5fcGljdHVyZSk7XG4gICAgcm93Ll93ZWJzaXRlID0gRXhwb3J0ZXIudmFsaWRhdGVVcmwocm93Ll93ZWJzaXRlKTtcblxuICAgIG1hcFtyb3cuX3VpZF0gPSByb3c7XG4gIH0pO1xuXG4gIHJldHVybiBtYXBcbn07XG5cbkV4cG9ydGVyLmdldFBhZ2luYXRlZENhdGVnb3JpZXMgPSBhc3luYyAoc3RhcnQsIGxpbWl0KSA9PiB7XG4gIEV4cG9ydGVyLmxvZygnZ2V0UGFnaW5hdGVkQ2F0ZWdvcmllcycpXG4gIHZhciBlcnI7XG4gIHZhciBwcmVmaXggPSBFeHBvcnRlci5jb25maWcoJ3ByZWZpeCcpO1xuICB2YXIgc3RhcnRtcyA9ICtuZXcgRGF0ZSgpO1xuICB2YXIgcXVlcnkgPSAnU0VMRUNUICdcbiAgICArIHByZWZpeCArICdmb3J1bXMuZm9ydW1faWQgYXMgX2NpZCwgJ1xuICAgICsgcHJlZml4ICsgJ2ZvcnVtcy5mb3J1bV9uYW1lIGFzIF9uYW1lLCAnXG4gICAgKyBwcmVmaXggKyAnZm9ydW1zLmZvcnVtX2Rlc2MgYXMgX2Rlc2NyaXB0aW9uLCAnXG4gICAgKyBwcmVmaXggKyAnZm9ydW1zLmZvcnVtX3BhcmVudHMgYXMgX3BhcmVudENpZCAnXG4gICAgKyAnRlJPTSAnICsgcHJlZml4ICsgJ2ZvcnVtcyAnXG4gICAgKyAoc3RhcnQgPj0gMCAmJiBsaW1pdCA+PSAwID8gJ0xJTUlUICcgKyBzdGFydCArICcsJyArIGxpbWl0IDogJycpO1xuXG4gIGlmICghRXhwb3J0ZXIuY29ubmVjdGlvbikge1xuICAgIGVyciA9IHsgZXJyb3I6ICdNeVNRTCBjb25uZWN0aW9uIGlzIG5vdCBzZXR1cC4gUnVuIHNldHVwKGNvbmZpZykgZmlyc3QnIH07XG4gICAgRXhwb3J0ZXIuZXJyb3IoZXJyLmVycm9yKTtcbiAgICB0aHJvdyBlcnJcbiAgfVxuXG4gIGNvbnN0IHJvd3MgPSBhd2FpdCBleGVjdXRlUXVlcnkocXVlcnkpXG5cbiAgLy9ub3JtYWxpemUgaGVyZVxuICB2YXIgbWFwID0ge307XG4gIGZvciAoY29uc3Qgcm93IG9mIHJvd3MpIHtcbiAgICByb3cuX25hbWUgPSByb3cuX25hbWUgfHwgJ1VudGl0bGVkIENhdGVnb3J5JztcbiAgICByb3cuX2Rlc2NyaXB0aW9uID0gcm93Ll9kZXNjcmlwdGlvbiB8fCAnJztcbiAgICByb3cuX3RpbWVzdGFtcCA9ICgocm93Ll90aW1lc3RhbXAgfHwgMCkgKiAxMDAwKSB8fCBzdGFydG1zO1xuICAgIHRyeSB7XG4gICAgICByb3cuX3BhcmVudENpZCA9IE51bWJlcihyb3cuX3BhcmVudENpZC5zcGxpdCgnOicpWzNdLnNwbGl0KCc7JylbMF0pXG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgcm93Ll9wYXJlbnRDaWQgPSB1bmRlZmluZWRcbiAgICB9XG5cbiAgICBtYXBbcm93Ll9jaWRdID0gcm93O1xuICB9XG5cbiAgcmV0dXJuIG1hcFxufTtcblxuY29uc3QgcHJvY2Vzc0F0dGFjaG1lbnRzID0gYXN5bmMgKGNvbnRlbnQsIHBpZCkgPT4ge1xuICBjb25zdCBwcmVmaXggPSBFeHBvcnRlci5jb25maWcoJ3ByZWZpeCcpO1xuICBsZXQgYXR0YWNobWVudHMgPSAoYXdhaXQgZXhlY3V0ZVF1ZXJ5KGBcblx0XHRTRUxFQ1QgKiBGUk9NICR7cHJlZml4fWF0dGFjaG1lbnRzIFdIRVJFIHBvc3RfbXNnX2lkID0gJHtwaWR9XG5cdGApKS5tYXAoYSA9PiAoe1xuICAgICAgb3JpZ19maWxlbmFtZTogYS5yZWFsX2ZpbGVuYW1lLFxuICAgICAgdXJsOiBcIi91cGxvYWRzL3BocGJiL1wiICsgYS5waHlzaWNhbF9maWxlbmFtZSArICcuJyArIGEuZXh0ZW5zaW9uLFxuICAgIH0pKVxuICBjb25zb2xlLmxvZygncHJvY2Vzc2luZycsIGF0dGFjaG1lbnRzKVxuICBmb3IgKGNvbnN0IGF0dCBvZiBhdHRhY2htZW50cykge1xuICAgIGNvbnRlbnQgPSBjb250ZW50LnJlcGxhY2UoXG4gICAgICBuZXcgUmVnRXhwKGBcXFxcW2F0dGFjaG1lbnQuK1xcXFxdJHthdHQub3JpZ19maWxlbmFtZX1cXFxcWy9hdHRhY2htZW50XFxcXF1gLCAnZycpLCBgIVske2F0dC5vcmlnX2ZpbGVuYW1lfV0oJHthdHQudXJsfSlgXG4gICAgKVxuICB9XG4gIHJldHVybiBjb250ZW50XG59XG5cbkV4cG9ydGVyLmdldFBhZ2luYXRlZFRvcGljcyA9IGFzeW5jIChzdGFydCwgbGltaXQpID0+IHtcbiAgRXhwb3J0ZXIubG9nKCdnZXRQYWdpbmF0ZWRUb3BpY3MnKVxuICB2YXIgZXJyO1xuICB2YXIgcHJlZml4ID0gRXhwb3J0ZXIuY29uZmlnKCdwcmVmaXgnKTtcbiAgdmFyIHN0YXJ0bXMgPSArbmV3IERhdGUoKTtcbiAgdmFyIHF1ZXJ5ID1cbiAgICAnU0VMRUNUICdcbiAgICArIHByZWZpeCArICd0b3BpY3MudG9waWNfaWQgYXMgX3RpZCwgJ1xuICAgICsgcHJlZml4ICsgJ3RvcGljcy5mb3J1bV9pZCBhcyBfY2lkLCAnXG5cbiAgICAvLyB0aGlzIGlzIHRoZSAncGFyZW50LXBvc3QnXG4gICAgLy8gc2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9ha2hvdXJ5L25vZGViYi1wbHVnaW4taW1wb3J0I2ltcG9ydGFudC1ub3RlLW9uLXRvcGljcy1hbmQtcG9zdHNcbiAgICAvLyBJIGRvbid0IHJlYWxseSBuZWVkIGl0IHNpbmNlIEkganVzdCBkbyBhIHNpbXBsZSBqb2luIGFuZCBnZXQgaXRzIGNvbnRlbnQsIGJ1dCBJIHdpbGwgaW5jbHVkZSBmb3IgdGhlIHJlZmVyZW5jZVxuICAgIC8vIHJlbWVtYmVyIHRoaXMgcG9zdCBFWENMVURFRCBpbiB0aGUgZXhwb3J0UG9zdHMoKSBmdW5jdGlvblxuICAgICsgcHJlZml4ICsgJ3RvcGljcy50b3BpY19maXJzdF9wb3N0X2lkIGFzIF9waWQsICdcblxuICAgICsgcHJlZml4ICsgJ3RvcGljcy50b3BpY192aWV3cyBhcyBfdmlld2NvdW50LCAnXG4gICAgKyBwcmVmaXggKyAndG9waWNzLnRvcGljX3RpdGxlIGFzIF90aXRsZSwgJ1xuICAgICsgcHJlZml4ICsgJ3RvcGljcy50b3BpY190aW1lIGFzIF90aW1lc3RhbXAsICdcblxuICAgIC8vIG1heWJlIHVzZSB0aGF0IHRvIHNraXBcbiAgICAvLyArIHByZWZpeCArICd0b3BpY3MudG9waWNfYXBwcm92ZWQgYXMgX2FwcHJvdmVkLCAnXG5cbiAgICArIHByZWZpeCArICd0b3BpY3MudG9waWNfc3RhdHVzIGFzIF9zdGF0dXMsICdcblxuICAgIC8vKyBwcmVmaXggKyAnVE9QSUNTLlRPUElDX0lTX1NUSUNLWSBhcyBfcGlubmVkLCAnXG4gICAgKyBwcmVmaXggKyAncG9zdHMucG9zdGVyX2lkIGFzIF91aWQsICdcbiAgICAvLyB0aGlzIHNob3VsZCBiZSA9PSB0byB0aGUgX3RpZCBvbiB0b3Agb2YgdGhpcyBxdWVyeVxuICAgICsgcHJlZml4ICsgJ3Bvc3RzLnRvcGljX2lkIGFzIF9wb3N0X3RpZCwgJ1xuXG4gICAgLy8gYW5kIHRoZXJlIGlzIHRoZSBjb250ZW50IEkgbmVlZCAhIVxuICAgICsgcHJlZml4ICsgJ3Bvc3RzLnBvc3RfdGV4dCBhcyBfY29udGVudCAnXG5cbiAgICArICdGUk9NICcgKyBwcmVmaXggKyAndG9waWNzLCAnICsgcHJlZml4ICsgJ3Bvc3RzICdcbiAgICAvLyBzZWVcbiAgICArICdXSEVSRSAnICsgcHJlZml4ICsgJ3RvcGljcy50b3BpY19maXJzdF9wb3N0X2lkPScgKyBwcmVmaXggKyAncG9zdHMucG9zdF9pZCAnXG4gICAgKyAoc3RhcnQgPj0gMCAmJiBsaW1pdCA+PSAwID8gJ0xJTUlUICcgKyBzdGFydCArICcsJyArIGxpbWl0IDogJycpO1xuXG4gIGlmICghRXhwb3J0ZXIuY29ubmVjdGlvbikge1xuICAgIGVyciA9IHsgZXJyb3I6ICdNeVNRTCBjb25uZWN0aW9uIGlzIG5vdCBzZXR1cC4gUnVuIHNldHVwKGNvbmZpZykgZmlyc3QnIH07XG4gICAgRXhwb3J0ZXIuZXJyb3IoZXJyLmVycm9yKTtcbiAgICB0aHJvdyBlcnJcbiAgfVxuXG4gIGNvbnN0IHJvd3MgPSBhd2FpdCBleGVjdXRlUXVlcnkocXVlcnkpXG4gIGNvbnNvbGUubG9nKCdyb3dzJywgcm93cylcblxuICAvL25vcm1hbGl6ZSBoZXJlXG4gIHZhciBtYXAgPSB7fTtcbiAgbGV0IHRvcGljQ291bnQgPSAwO1xuICBmb3IgKGNvbnN0IHJvdyBvZiByb3dzKSB7XG4gICAgdG9waWNDb3VudCsrXG4gICAgRXhwb3J0ZXIubG9nKGBUb3BpYyAke3RvcGljQ291bnR9IG91dCBvZiAke3Jvd3MubGVuZ3RofWApXG4gICAgcm93Ll9jb250ZW50ID0gZml4QkIocm93Ll9jb250ZW50KVxuICAgIHJvdy5fY29udGVudCA9IGF3YWl0IHByb2Nlc3NBdHRhY2htZW50cyhyb3cuX2NvbnRlbnQsIHJvdy5fcGlkKVxuICAgIGNvbnNvbGUubG9nKHJvdylcblxuICAgIHJvdy5fdGl0bGUgPSByb3cuX3RpdGxlID8gcm93Ll90aXRsZVswXS50b1VwcGVyQ2FzZSgpICsgcm93Ll90aXRsZS5zdWJzdHIoMSkgOiAnVW50aXRsZWQnO1xuICAgIHJvdy5fdGltZXN0YW1wID0gKChyb3cuX3RpbWVzdGFtcCB8fCAwKSAqIDEwMDApIHx8IHN0YXJ0bXM7XG5cbiAgICBtYXBbcm93Ll90aWRdID0gcm93O1xuICB9XG5cbiAgcmV0dXJuIG1hcFxufTtcblxudmFyIGdldFRvcGljc01haW5QaWRzID0gYXN5bmMgKCkgPT4ge1xuICBpZiAoRXhwb3J0ZXIuX3RvcGljc01haW5QaWRzKSB7XG4gICAgcmV0dXJuIEV4cG9ydGVyLl90b3BpY3NNYWluUGlkc1xuICB9XG4gIGNvbnN0IHRvcGljc01hcCA9IGF3YWl0IEV4cG9ydGVyLmdldFBhZ2luYXRlZFRvcGljcygwLCAtMSlcblxuICBFeHBvcnRlci5fdG9waWNzTWFpblBpZHMgPSB7fTtcbiAgT2JqZWN0LmtleXModG9waWNzTWFwKS5mb3JFYWNoKGZ1bmN0aW9uIChfdGlkKSB7XG4gICAgdmFyIHRvcGljID0gdG9waWNzTWFwW190aWRdO1xuICAgIEV4cG9ydGVyLl90b3BpY3NNYWluUGlkc1t0b3BpYy5fcGlkXSA9IHRvcGljLl90aWQ7XG4gIH0pO1xuICByZXR1cm4gRXhwb3J0ZXIuX3RvcGljc01haW5QaWRzXG59O1xuXG4oKCkgPT4ge1xuICBsZXQgYXR0YWNobWVudHNEb3dubG9hZGVkID0gZmFsc2VcbiAgRXhwb3J0ZXIuZG93bmxvYWRBdHRhY2htZW50cyA9IGFzeW5jICgpID0+IHtcbiAgICBpZiAoIUV4cG9ydGVyLmNvbmZpZygpLmF0dGFjaG1lbnRfdXJsKSByZXR1cm5cbiAgICBpZiAoYXR0YWNobWVudHNEb3dubG9hZGVkKSByZXR1cm5cbiAgICBhdHRhY2htZW50c0Rvd25sb2FkZWQgPSB0cnVlXG4gICAgRXhwb3J0ZXIubG9nKCdEb3dubG9hZGluZyBhdHRhY2htZW50cycpXG4gICAgY29uc3QgcHJlZml4ID0gRXhwb3J0ZXIuY29uZmlnKCdwcmVmaXgnKTtcblxuICAgIGNvbnN0IGF0dGFjaG1lbnRzID0gYXdhaXQgZXhlY3V0ZVF1ZXJ5KGBcblx0XHRcdFNFTEVDVCAqIEZST00gJHtwcmVmaXh9YXR0YWNobWVudHNcblx0XHRgKVxuICAgIGF3YWl0IFByb21pc2UuYWxsKGF0dGFjaG1lbnRzLm1hcChhc3luYyAoYSkgPT4gZ2V0RmlsZShcbiAgICAgIEV4cG9ydGVyLmNvbmZpZygpLmF0dGFjaG1lbnRfdXJsICsgYS5waHlzaWNhbF9maWxlbmFtZSxcbiAgICAgIGEuYXR0YWNoX2lkICsgJ18nICsgYS5yZWFsX2ZpbGVuYW1lXG4gICAgKSkpXG4gIH1cbn0pKClcblxuRXhwb3J0ZXIuZ2V0UGFnaW5hdGVkUG9zdHMgPSBhc3luYyAoc3RhcnQsIGxpbWl0KSA9PiB7XG4gIEV4cG9ydGVyLmxvZygnZ2V0UGFnaW5hdGVkUG9zdHMnKVxuICBhd2FpdCBFeHBvcnRlci5kb3dubG9hZEF0dGFjaG1lbnRzKClcbiAgdmFyIGVycjtcbiAgdmFyIHByZWZpeCA9IEV4cG9ydGVyLmNvbmZpZygncHJlZml4Jyk7XG4gIHZhciBzdGFydG1zID0gK25ldyBEYXRlKCk7XG4gIHZhciBxdWVyeSA9XG4gICAgJ1NFTEVDVCAnICsgcHJlZml4ICsgJ3Bvc3RzLnBvc3RfaWQgYXMgX3BpZCwgJ1xuICAgIC8vKyAnUE9TVF9QQVJFTlRfSUQgYXMgX3Bvc3RfcmVwbHlpbmdfdG8sICcgcGhwYmIgZG9lc24ndCBoYXZlIFwicmVwbHkgdG8gYW5vdGhlciBwb3N0XCJcbiAgICArIHByZWZpeCArICdwb3N0cy50b3BpY19pZCBhcyBfdGlkLCAnXG4gICAgKyBwcmVmaXggKyAncG9zdHMucG9zdF90aW1lIGFzIF90aW1lc3RhbXAsICdcbiAgICAvLyBub3QgYmVpbmcgdXNlZFxuICAgICsgcHJlZml4ICsgJ3Bvc3RzLnBvc3Rfc3ViamVjdCBhcyBfc3ViamVjdCwgJ1xuXG4gICAgKyBwcmVmaXggKyAncG9zdHMucG9zdF90ZXh0IGFzIF9jb250ZW50LCAnXG4gICAgKyBwcmVmaXggKyAncG9zdHMucG9zdGVyX2lkIGFzIF91aWQgJ1xuXG4gICAgLy8gbWF5YmUgdXNlIHRoaXMgb25lIHRvIHNraXBcbiAgICAvLysgcHJlZml4ICsgJ3Bvc3RzLnBvc3RfYXBwcm92ZWQgYXMgX2FwcHJvdmVkICdcblxuICAgICsgJ0ZST00gJyArIHByZWZpeCArICdwb3N0cyAnXG5cbiAgICAvLyB0aGUgb25lcyB0aGF0IGFyZSB0b3BpY3MgbWFpbiBwb3N0cyBhcmUgZmlsdGVyZWQgYmVsb3dcbiAgICArICdXSEVSRSAnICsgcHJlZml4ICsgJ3Bvc3RzLnRvcGljX2lkID4gMCAnXG4gICAgKyAoc3RhcnQgPj0gMCAmJiBsaW1pdCA+PSAwID8gJ0xJTUlUICcgKyBzdGFydCArICcsJyArIGxpbWl0IDogJycpO1xuXG4gIGlmICghRXhwb3J0ZXIuY29ubmVjdGlvbikge1xuICAgIGVyciA9IHsgZXJyb3I6ICdNeVNRTCBjb25uZWN0aW9uIGlzIG5vdCBzZXR1cC4gUnVuIHNldHVwKGNvbmZpZykgZmlyc3QnIH07XG4gICAgRXhwb3J0ZXIuZXJyb3IoZXJyLmVycm9yKTtcbiAgICB0aHJvdyBlcnJcbiAgfVxuXG4gIGNvbnN0IHJvd3MgPSBhd2FpdCBleGVjdXRlUXVlcnkocXVlcnkpXG4gIGNvbnN0IG1waWRzID0gYXdhaXQgZ2V0VG9waWNzTWFpblBpZHMoKVxuXG4gIC8vbm9ybWFsaXplIGhlcmVcbiAgdmFyIG1hcCA9IHt9O1xuICBsZXQgY3VycmVudFBvc3ROdW0gPSAwXG4gIGZvciAoY29uc3Qgcm93IG9mIHJvd3MpIHtcbiAgICBjdXJyZW50UG9zdE51bSsrXG4gICAgRXhwb3J0ZXIubG9nKGBQb3N0ICR7Y3VycmVudFBvc3ROdW19IG91dCBvZiAke3Jvd3MubGVuZ3RofWApXG4gICAgLy8gbWFrZSBpdCdzIG5vdCBhIHRvcGljXG4gICAgaWYgKCFtcGlkc1tyb3cuX3BpZF0pIHtcbiAgICAgIHJvdy5fY29udGVudCA9IGZpeEJCKHJvdy5fY29udGVudClcbiAgICAgIHJvdy5fY29udGVudCA9IGF3YWl0IHByb2Nlc3NBdHRhY2htZW50cyhyb3cuX2NvbnRlbnQsIHJvdy5fcGlkKVxuICAgICAgcm93Ll90aW1lc3RhbXAgPSAoKHJvdy5fdGltZXN0YW1wIHx8IDApICogMTAwMCkgfHwgc3RhcnRtcztcbiAgICAgIG1hcFtyb3cuX3BpZF0gPSByb3c7XG4gICAgfVxuICB9XG4gIHJldHVybiBtYXBcbn07XG5cbkV4cG9ydGVyLnRlYXJkb3duID0gKCkgPT4ge1xuICBFeHBvcnRlci5sb2coJ3RlYXJkb3duJyk7XG4gIEV4cG9ydGVyLmNvbm5lY3Rpb24uZW5kKCk7XG5cbiAgRXhwb3J0ZXIubG9nKCdEb25lJyk7XG59O1xuXG5FeHBvcnRlci5wYWdpbmF0ZWRUZXN0cnVuID0gYXN5bmMgKGNvbmZpZykgPT4ge1xuICBFeHBvcnRlci5zZXR1cChjb25maWcpXG4gIEV4cG9ydGVyLmdldFBhZ2luYXRlZFVzZXJzKDAsIDEwMDApXG4gIEV4cG9ydGVyLmdldFBhZ2luYXRlZENhdGVnb3JpZXMoMCwgMTAwMClcbiAgRXhwb3J0ZXIuZ2V0UGFnaW5hdGVkVG9waWNzKDAsIDEwMDApXG4gIEV4cG9ydGVyLmdldFBhZ2luYXRlZFBvc3RzKDEwMDEsIDIwMDApXG4gIEV4cG9ydGVyLnRlYXJkb3duKClcbn07XG5cbkV4cG9ydGVyLndhcm4gPSBmdW5jdGlvbiAoKSB7XG4gIHZhciBhcmdzID0gXy50b0FycmF5KGFyZ3VtZW50cyk7XG4gIGFyZ3MudW5zaGlmdChsb2dQcmVmaXgpO1xuICBjb25zb2xlLndhcm4uYXBwbHkoY29uc29sZSwgYXJncyk7XG59O1xuXG5FeHBvcnRlci5sb2cgPSBmdW5jdGlvbiAoKSB7XG4gIHZhciBhcmdzID0gXy50b0FycmF5KGFyZ3VtZW50cyk7XG4gIGFyZ3MudW5zaGlmdChsb2dQcmVmaXgpO1xuICBjb25zb2xlLmxvZy5hcHBseShjb25zb2xlLCBhcmdzKTtcbn07XG5cbkV4cG9ydGVyLmVycm9yID0gZnVuY3Rpb24gKCkge1xuICB2YXIgYXJncyA9IF8udG9BcnJheShhcmd1bWVudHMpO1xuICBhcmdzLnVuc2hpZnQobG9nUHJlZml4KTtcbiAgY29uc29sZS5lcnJvci5hcHBseShjb25zb2xlLCBhcmdzKTtcbn07XG5cbkV4cG9ydGVyLmNvbmZpZyA9IGZ1bmN0aW9uIChjb25maWcsIHZhbCkge1xuICBpZiAoY29uZmlnICE9IG51bGwpIHtcbiAgICBpZiAodHlwZW9mIGNvbmZpZyA9PT0gJ29iamVjdCcpIHtcbiAgICAgIEV4cG9ydGVyLl9jb25maWcgPSBjb25maWc7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgY29uZmlnID09PSAnc3RyaW5nJykge1xuICAgICAgaWYgKHZhbCAhPSBudWxsKSB7XG4gICAgICAgIEV4cG9ydGVyLl9jb25maWcgPSBFeHBvcnRlci5fY29uZmlnIHx8IHt9O1xuICAgICAgICBFeHBvcnRlci5fY29uZmlnW2NvbmZpZ10gPSB2YWw7XG4gICAgICB9XG4gICAgICByZXR1cm4gRXhwb3J0ZXIuX2NvbmZpZ1tjb25maWddO1xuICAgIH1cbiAgfVxuICByZXR1cm4gRXhwb3J0ZXIuX2NvbmZpZztcbn07XG5cbi8vIGZyb20gQW5ndWxhciBodHRwczovL2dpdGh1Yi5jb20vYW5ndWxhci9hbmd1bGFyLmpzL2Jsb2IvbWFzdGVyL3NyYy9uZy9kaXJlY3RpdmUvaW5wdXQuanMjTDExXG5FeHBvcnRlci52YWxpZGF0ZVVybCA9IGZ1bmN0aW9uICh1cmwpIHtcbiAgdmFyIHBhdHRlcm4gPSAvXihmdHB8aHR0cHxodHRwcyk6XFwvXFwvKFxcdys6ezAsMX1cXHcqQCk/KFxcUyspKDpbMC05XSspPyhcXC98XFwvKFtcXHcjITouPys9JiVAIVxcLVxcL10pKT8kLztcbiAgcmV0dXJuIHVybCAmJiB1cmwubGVuZ3RoIDwgMjA4MyAmJiB1cmwubWF0Y2gocGF0dGVybikgPyB1cmwgOiAnJztcbn07XG5cbkV4cG9ydGVyLnRydW5jYXRlU3RyID0gZnVuY3Rpb24gKHN0ciwgbGVuKSB7XG4gIGlmICh0eXBlb2Ygc3RyICE9ICdzdHJpbmcnKSByZXR1cm4gc3RyO1xuICBsZW4gPSBfLmlzTnVtYmVyKGxlbikgJiYgbGVuID4gMyA/IGxlbiA6IDIwO1xuICByZXR1cm4gc3RyLmxlbmd0aCA8PSBsZW4gPyBzdHIgOiBzdHIuc3Vic3RyKDAsIGxlbiAtIDMpICsgJy4uLic7XG59O1xuXG5FeHBvcnRlci53aGljaElzRmFsc3kgPSBmdW5jdGlvbiAoYXJyKSB7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgYXJyLmxlbmd0aDsgaSsrKSB7XG4gICAgaWYgKCFhcnJbaV0pXG4gICAgICByZXR1cm4gaTtcbiAgfVxuICByZXR1cm4gbnVsbDtcbn07XG4iXX0=