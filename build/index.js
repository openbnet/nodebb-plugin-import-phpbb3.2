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
  const fixed = bb.replace(/<s>([\w\W]*?)<\/s>/mig, '$1').replace(/<e>([\w\W]*?)<\/e>/mig, '$1').replace(/<U>([\w\W]*?)<\/U>/mig, '$1').replace(/<B>([\w\W]*?)<\/B>/mig, '$1').replace(/<r>([\w\W]*?)<\/r>/mig, '$1').replace(/<t>([\w\W]*?)<\/t>/mig, '$1').replace(/<quote.*>([\w\W]*?)<\/quote>/mig, '$1').replace(/<color.+?>([\w\W]*?)<\/color>/mig, '$1').replace(/<link_text.+?>([\w\W]*?)<\/link_text>/mig, '$1').replace(/<url.+?>([\w\W]*?)<\/url>/mig, '$1').replace(/<emoji.+?>([\w\W]*?)<\/emoji>/mig, '$1').replace(/<attachment.+?>([\w\W]*?)<\/attachment>/mig, '$1').replace(/<!--[^>]+-->/, ''); // html comment
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9pbmRleC5qcyJdLCJuYW1lcyI6WyJhc3luYyIsInJlcXVpcmUiLCJteXNxbCIsIl8iLCJub29wIiwibG9nUHJlZml4IiwiaHR0cCIsInByb2Nlc3MiLCJwYXRoIiwiZnMiLCJta2RpcnAiLCJFeHBvcnRlciIsIm1vZHVsZSIsImV4cG9ydHMiLCJmaXhCQiIsImJiIiwiZml4ZWQiLCJyZXBsYWNlIiwiZ2V0RmlsZSIsInVybCIsIm91dHB1dCIsIlByb21pc2UiLCJyZXNvbHZlIiwicmVqZWN0IiwiZGVzdCIsImpvaW4iLCJjd2QiLCJkaXJuYW1lIiwiZXJyIiwibG9nIiwiZmlsZSIsImNyZWF0ZVdyaXRlU3RyZWFtIiwicmVxdWVzdCIsImdldCIsInJlc3BvbnNlIiwicGlwZSIsIm9uIiwiY2xvc2UiLCJ1bmxpbmsiLCJtZXNzYWdlIiwiZXhlY3V0ZVF1ZXJ5IiwicXVlcnkiLCJjb25uZWN0aW9uIiwicm93cyIsInNldHVwIiwiY29uZmlnIiwiX2NvbmZpZyIsImhvc3QiLCJkYmhvc3QiLCJ1c2VyIiwiZGJ1c2VyIiwicGFzc3dvcmQiLCJkYnBhc3MiLCJwYXNzIiwicG9ydCIsImRicG9ydCIsImRhdGFiYXNlIiwiZGJuYW1lIiwibmFtZSIsImF0dGFjaG1lbnRfdXJsIiwiY3VzdG9tIiwicHJlZml4IiwidGFibGVQcmVmaXgiLCJjcmVhdGVDb25uZWN0aW9uIiwiY29ubmVjdCIsImdldFBhZ2luYXRlZFVzZXJzIiwic3RhcnQiLCJsaW1pdCIsInN0YXJ0bXMiLCJEYXRlIiwiZXJyb3IiLCJmaWx0ZXIiLCJyIiwiX3Bvc3RfY291bnQiLCJtYXAiLCJmb3JFYWNoIiwicm93IiwiX3NpZ25hdHVyZSIsInRydW5jYXRlU3RyIiwiX2pvaW5kYXRlIiwiX2VtYWlsIiwidG9Mb3dlckNhc2UiLCJfcGljdHVyZSIsInZhbGlkYXRlVXJsIiwiX3dlYnNpdGUiLCJfdWlkIiwiZ2V0UGFnaW5hdGVkQ2F0ZWdvcmllcyIsIl9uYW1lIiwiX2Rlc2NyaXB0aW9uIiwiX3RpbWVzdGFtcCIsIl9wYXJlbnRDaWQiLCJOdW1iZXIiLCJzcGxpdCIsImUiLCJ1bmRlZmluZWQiLCJfY2lkIiwicHJvY2Vzc0F0dGFjaG1lbnRzIiwiY29udGVudCIsInBpZCIsImF0dGFjaG1lbnRzIiwib3JpZ19maWxlbmFtZSIsImEiLCJyZWFsX2ZpbGVuYW1lIiwicGh5c2ljYWxfZmlsZW5hbWUiLCJleHRlbnNpb24iLCJjb25zb2xlIiwiYXR0IiwiUmVnRXhwIiwiZ2V0UGFnaW5hdGVkVG9waWNzIiwidG9waWNDb3VudCIsImxlbmd0aCIsIl9jb250ZW50IiwiX3BpZCIsIl90aXRsZSIsInRvVXBwZXJDYXNlIiwic3Vic3RyIiwiX3RpZCIsImdldFRvcGljc01haW5QaWRzIiwiX3RvcGljc01haW5QaWRzIiwidG9waWNzTWFwIiwiT2JqZWN0Iiwia2V5cyIsInRvcGljIiwiYXR0YWNobWVudHNEb3dubG9hZGVkIiwiZG93bmxvYWRBdHRhY2htZW50cyIsImFsbCIsImF0dGFjaF9pZCIsImdldFBhZ2luYXRlZFBvc3RzIiwibXBpZHMiLCJjdXJyZW50UG9zdE51bSIsInRlYXJkb3duIiwiZW5kIiwicGFnaW5hdGVkVGVzdHJ1biIsIndhcm4iLCJhcmdzIiwidG9BcnJheSIsImFyZ3VtZW50cyIsInVuc2hpZnQiLCJhcHBseSIsInZhbCIsInBhdHRlcm4iLCJtYXRjaCIsInN0ciIsImxlbiIsImlzTnVtYmVyIiwid2hpY2hJc0ZhbHN5IiwiYXJyIiwiaSJdLCJtYXBwaW5ncyI6Ijs7OztBQUFBLElBQUlBLFFBQVFDLFFBQVEsT0FBUixDQUFaO0FBQ0EsSUFBSUMsUUFBUUQsUUFBUSxPQUFSLENBQVo7QUFDQSxJQUFJRSxJQUFJRixRQUFRLFdBQVIsQ0FBUjtBQUNBLElBQUlHLE9BQU8sU0FBUEEsSUFBTyxHQUFZLENBQUcsQ0FBMUI7QUFDQSxJQUFJQyxZQUFZLGlDQUFoQjtBQUNBLE1BQU1DLE9BQU9MLFFBQVEsTUFBUixDQUFiO0FBQ0EsTUFBTU0sVUFBVU4sUUFBUSxTQUFSLENBQWhC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QUFDckMsT0FBSyxJQUFJQyxJQUFJLENBQWIsRUFBZ0JBLElBQUlELElBQUlwQyxNQUF4QixFQUFnQ3FDLEdBQWhDLEVBQXFDO0FBQ25DLFFBQUksQ0FBQ0QsSUFBSUMsQ0FBSixDQUFMLEVBQ0UsT0FBT0EsQ0FBUDtBQUNIO0FBQ0QsU0FBTyxJQUFQO0FBQ0QsQ0FORCIsImZpbGUiOiJpbmRleC5qcyIsInNvdXJjZXNDb250ZW50IjpbInZhciBhc3luYyA9IHJlcXVpcmUoJ2FzeW5jJyk7XG52YXIgbXlzcWwgPSByZXF1aXJlKCdteXNxbCcpO1xudmFyIF8gPSByZXF1aXJlKCdsb2Rhc2gvZnAnKTtcbnZhciBub29wID0gZnVuY3Rpb24gKCkgeyB9O1xudmFyIGxvZ1ByZWZpeCA9ICdbbm9kZWJiLXBsdWdpbi1pbXBvcnQtcGhwYmIzLjJdJztcbmNvbnN0IGh0dHAgPSByZXF1aXJlKCdodHRwJylcbmNvbnN0IHByb2Nlc3MgPSByZXF1aXJlKCdwcm9jZXNzJylcbmNvbnN0IHBhdGggPSByZXF1aXJlKCdwYXRoJylcbmNvbnN0IGZzID0gcmVxdWlyZSgnZnMnKVxuY29uc3QgbWtkaXJwID0gcmVxdWlyZSgnbWtkaXJwJylcblxuY29uc3QgRXhwb3J0ZXIgPSBtb2R1bGUuZXhwb3J0c1xuXG5jb25zdCBmaXhCQiA9IChiYikgPT4ge1xuICBjb25zdCBmaXhlZCA9IGJiXG4gICAgLnJlcGxhY2UoLzxzPihbXFx3XFxXXSo/KTxcXC9zPi9taWcsICckMScpXG4gICAgLnJlcGxhY2UoLzxlPihbXFx3XFxXXSo/KTxcXC9lPi9taWcsICckMScpXG4gICAgLnJlcGxhY2UoLzxVPihbXFx3XFxXXSo/KTxcXC9VPi9taWcsICckMScpXG4gICAgLnJlcGxhY2UoLzxCPihbXFx3XFxXXSo/KTxcXC9CPi9taWcsICckMScpXG4gICAgLnJlcGxhY2UoLzxyPihbXFx3XFxXXSo/KTxcXC9yPi9taWcsICckMScpXG4gICAgLnJlcGxhY2UoLzx0PihbXFx3XFxXXSo/KTxcXC90Pi9taWcsICckMScpXG4gICAgLnJlcGxhY2UoLzxxdW90ZS4qPihbXFx3XFxXXSo/KTxcXC9xdW90ZT4vbWlnLCAnJDEnKVxuICAgIC5yZXBsYWNlKC88Y29sb3IuKz8+KFtcXHdcXFddKj8pPFxcL2NvbG9yPi9taWcsICckMScpXG4gICAgLnJlcGxhY2UoLzxsaW5rX3RleHQuKz8+KFtcXHdcXFddKj8pPFxcL2xpbmtfdGV4dD4vbWlnLCAnJDEnKVxuICAgIC5yZXBsYWNlKC88dXJsLis/PihbXFx3XFxXXSo/KTxcXC91cmw+L21pZywgJyQxJylcbiAgICAucmVwbGFjZSgvPGVtb2ppLis/PihbXFx3XFxXXSo/KTxcXC9lbW9qaT4vbWlnLCAnJDEnKVxuICAgIC5yZXBsYWNlKC88YXR0YWNobWVudC4rPz4oW1xcd1xcV10qPyk8XFwvYXR0YWNobWVudD4vbWlnLCAnJDEnKVxuICAgIC5yZXBsYWNlKC88IS0tW14+XSstLT4vLCAnJykgLy8gaHRtbCBjb21tZW50XG4gIHJldHVybiBmaXhlZFxufVxuXG5jb25zdCBnZXRGaWxlID0gKHVybCwgb3V0cHV0KSA9PiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gIGNvbnN0IGRlc3QgPSBwYXRoLmpvaW4ocHJvY2Vzcy5jd2QoKSwgJ3B1YmxpYycsICd1cGxvYWRzJywgJ3BocGJiJywgb3V0cHV0KVxuICBta2RpcnAocGF0aC5kaXJuYW1lKGRlc3QpLCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgaWYgKGVycikgcmV0dXJuIHJlamVjdChlcnIpXG5cbiAgICBFeHBvcnRlci5sb2coJ0Rvd25sb2FkaW5nJywgdXJsLCAndG8nLCBkZXN0KVxuXG4gICAgdmFyIGZpbGUgPSBmcy5jcmVhdGVXcml0ZVN0cmVhbShkZXN0KTtcbiAgICB2YXIgcmVxdWVzdCA9IGh0dHAuZ2V0KHVybCwgZnVuY3Rpb24gKHJlc3BvbnNlKSB7XG4gICAgICByZXNwb25zZS5waXBlKGZpbGUpO1xuICAgICAgZmlsZS5vbignZmluaXNoJywgZnVuY3Rpb24gKCkge1xuICAgICAgICBmaWxlLmNsb3NlKHJlc29sdmUpO1xuICAgICAgfSlcbiAgICB9KS5vbignZXJyb3InLCBmdW5jdGlvbiAoZXJyKSB7XG4gICAgICBmcy51bmxpbmsoZGVzdCk7XG4gICAgICByZWplY3QoZXJyLm1lc3NhZ2UpXG4gICAgfSlcbiAgfSk7XG59KVxuXG5jb25zdCBleGVjdXRlUXVlcnkgPSAocXVlcnkpID0+IG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgRXhwb3J0ZXIuY29ubmVjdGlvbi5xdWVyeShxdWVyeSwgKGVyciwgcm93cykgPT4ge1xuICAgIGlmIChlcnIpIHJldHVybiByZWplY3QoZXJyKVxuICAgIHJlc29sdmUocm93cylcbiAgfSk7XG59KVxuXG5FeHBvcnRlci5zZXR1cCA9IChjb25maWcpID0+IHtcbiAgRXhwb3J0ZXIubG9nKCdzZXR1cCcpO1xuXG4gIHZhciBfY29uZmlnID0ge1xuICAgIGhvc3Q6IGNvbmZpZy5kYmhvc3QgfHwgY29uZmlnLmhvc3QgfHwgJ2xvY2FsaG9zdCcsXG4gICAgdXNlcjogY29uZmlnLmRidXNlciB8fCBjb25maWcudXNlciB8fCAncm9vdCcsXG4gICAgcGFzc3dvcmQ6IGNvbmZpZy5kYnBhc3MgfHwgY29uZmlnLnBhc3MgfHwgY29uZmlnLnBhc3N3b3JkIHx8ICcnLFxuICAgIHBvcnQ6IGNvbmZpZy5kYnBvcnQgfHwgY29uZmlnLnBvcnQgfHwgMzMwNixcbiAgICBkYXRhYmFzZTogY29uZmlnLmRibmFtZSB8fCBjb25maWcubmFtZSB8fCBjb25maWcuZGF0YWJhc2UgfHwgJ3BocGJiJyxcbiAgICBhdHRhY2htZW50X3VybDogY29uZmlnLmN1c3RvbSA/IGNvbmZpZy5jdXN0b20uYXR0YWNobWVudF91cmwgOiBmYWxzZSxcbiAgfTtcblxuICBFeHBvcnRlci5jb25maWcoX2NvbmZpZyk7XG4gIEV4cG9ydGVyLmNvbmZpZygncHJlZml4JywgY29uZmlnLnByZWZpeCB8fCBjb25maWcudGFibGVQcmVmaXggfHwgJycgLyogcGhwYmJfID8gKi8pO1xuXG4gIEV4cG9ydGVyLmNvbm5lY3Rpb24gPSBteXNxbC5jcmVhdGVDb25uZWN0aW9uKF9jb25maWcpO1xuICBFeHBvcnRlci5jb25uZWN0aW9uLmNvbm5lY3QoKTtcblxuICByZXR1cm4gRXhwb3J0ZXIuY29uZmlnKClcbn1cblxuRXhwb3J0ZXIuZ2V0UGFnaW5hdGVkVXNlcnMgPSBhc3luYyAoc3RhcnQsIGxpbWl0KSA9PiB7XG4gIEV4cG9ydGVyLmxvZygnZ2V0UGFnaW5hdGVkVXNlcnMnKVxuICB2YXIgZXJyO1xuICB2YXIgcHJlZml4ID0gRXhwb3J0ZXIuY29uZmlnKCdwcmVmaXgnKTtcbiAgdmFyIHN0YXJ0bXMgPSArbmV3IERhdGUoKTtcbiAgdmFyIHF1ZXJ5ID0gJ1NFTEVDVCAnXG4gICAgKyBwcmVmaXggKyAndXNlcnMudXNlcl9pZCBhcyBfdWlkLCAnXG4gICAgKyBwcmVmaXggKyAndXNlcnMudXNlcm5hbWUgYXMgX3VzZXJuYW1lLCAnXG4gICAgKyBwcmVmaXggKyAndXNlcnMudXNlcm5hbWVfY2xlYW4gYXMgX2FsdGVybmF0aXZlVXNlcm5hbWUsICdcbiAgICArIHByZWZpeCArICd1c2Vycy51c2VyX2VtYWlsIGFzIF9yZWdpc3RyYXRpb25FbWFpbCwgJ1xuICAgIC8vKyBwcmVmaXggKyAndXNlcnMudXNlcl9yYW5rIGFzIF9sZXZlbCwgJ1xuICAgICsgcHJlZml4ICsgJ3VzZXJzLnVzZXJfcmVnZGF0ZSBhcyBfam9pbmRhdGUsICdcbiAgICArIHByZWZpeCArICd1c2Vycy51c2VyX3Bvc3RzIGFzIF9wb3N0X2NvdW50LCAnXG4gICAgKyBwcmVmaXggKyAndXNlcnMudXNlcl9lbWFpbCBhcyBfZW1haWwgJ1xuICAgIC8vKyBwcmVmaXggKyAnYmFubGlzdC5iYW5faWQgYXMgX2Jhbm5lZCAnXG4gICAgLy8rIHByZWZpeCArICdVU0VSX1BST0ZJTEUuVVNFUl9TSUdOQVRVUkUgYXMgX3NpZ25hdHVyZSwgJ1xuICAgIC8vKyBwcmVmaXggKyAnVVNFUl9QUk9GSUxFLlVTRVJfSE9NRVBBR0UgYXMgX3dlYnNpdGUsICdcbiAgICAvLysgcHJlZml4ICsgJ1VTRVJfUFJPRklMRS5VU0VSX09DQ1VQQVRJT04gYXMgX29jY3VwYXRpb24sICdcbiAgICAvLysgcHJlZml4ICsgJ1VTRVJfUFJPRklMRS5VU0VSX0xPQ0FUSU9OIGFzIF9sb2NhdGlvbiwgJ1xuICAgIC8vKyBwcmVmaXggKyAnVVNFUl9QUk9GSUxFLlVTRVJfQVZBVEFSIGFzIF9waWN0dXJlLCAnXG4gICAgLy8rIHByZWZpeCArICdVU0VSX1BST0ZJTEUuVVNFUl9USVRMRSBhcyBfdGl0bGUsICdcbiAgICAvLysgcHJlZml4ICsgJ1VTRVJfUFJPRklMRS5VU0VSX1JBVElORyBhcyBfcmVwdXRhdGlvbiwgJ1xuICAgIC8vKyBwcmVmaXggKyAnVVNFUl9QUk9GSUxFLlVTRVJfVE9UQUxfUkFURVMgYXMgX3Byb2ZpbGV2aWV3cywgJ1xuICAgIC8vKyBwcmVmaXggKyAnVVNFUl9QUk9GSUxFLlVTRVJfQklSVEhEQVkgYXMgX2JpcnRoZGF5ICdcblxuICAgICsgJ0ZST00gJyArIHByZWZpeCArICd1c2VycyAnXG4gICAgKyAnV0hFUkUgJyArIHByZWZpeCArICd1c2Vycy51c2VyX2lkID0gJyArIHByZWZpeCArICd1c2Vycy51c2VyX2lkICdcbiAgICArIChzdGFydCA+PSAwICYmIGxpbWl0ID49IDAgPyAnTElNSVQgJyArIHN0YXJ0ICsgJywnICsgbGltaXQgOiAnJyk7XG5cblxuICBpZiAoIUV4cG9ydGVyLmNvbm5lY3Rpb24pIHtcbiAgICBlcnIgPSB7IGVycm9yOiAnTXlTUUwgY29ubmVjdGlvbiBpcyBub3Qgc2V0dXAuIFJ1biBzZXR1cChjb25maWcpIGZpcnN0JyB9O1xuICAgIEV4cG9ydGVyLmVycm9yKGVyci5lcnJvcik7XG4gICAgdGhyb3cgZXJyXG4gIH1cblxuICBsZXQgcm93cyA9IGF3YWl0IGV4ZWN1dGVRdWVyeShxdWVyeSlcbiAgcm93cyA9IHJvd3MuZmlsdGVyKHIgPT4gci5fcG9zdF9jb3VudCA+IDApXG5cbiAgLy9ub3JtYWxpemUgaGVyZVxuICB2YXIgbWFwID0ge307XG4gIHJvd3MuZm9yRWFjaChmdW5jdGlvbiAocm93KSB7XG4gICAgLy8gbmJiIGZvcmNlcyBzaWduYXR1cmVzIHRvIGJlIGxlc3MgdGhhbiAxNTAgY2hhcnNcbiAgICAvLyBrZWVwaW5nIGl0IEhUTUwgc2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9ha2hvdXJ5L25vZGViYi1wbHVnaW4taW1wb3J0I21hcmtkb3duLW5vdGVcbiAgICByb3cuX3NpZ25hdHVyZSA9IEV4cG9ydGVyLnRydW5jYXRlU3RyKHJvdy5fc2lnbmF0dXJlIHx8ICcnLCAxNTApO1xuXG4gICAgLy8gZnJvbSB1bml4IHRpbWVzdGFtcCAocykgdG8gSlMgdGltZXN0YW1wIChtcylcbiAgICByb3cuX2pvaW5kYXRlID0gKChyb3cuX2pvaW5kYXRlIHx8IDApICogMTAwMCkgfHwgc3RhcnRtcztcblxuICAgIC8vIGxvd2VyIGNhc2UgdGhlIGVtYWlsIGZvciBjb25zaXN0ZW5jeVxuICAgIHJvdy5fZW1haWwgPSAocm93Ll9lbWFpbCB8fCAnJykudG9Mb3dlckNhc2UoKTtcblxuICAgIC8vIEkgZG9uJ3Qga25vdyBhYm91dCB5b3UgYWJvdXQgSSBub3RpY2VkIGEgbG90IG15IHVzZXJzIGhhdmUgaW5jb21wbGV0ZSB1cmxzLCB1cmxzIGxpa2U6IGh0dHA6Ly9cbiAgICByb3cuX3BpY3R1cmUgPSBFeHBvcnRlci52YWxpZGF0ZVVybChyb3cuX3BpY3R1cmUpO1xuICAgIHJvdy5fd2Vic2l0ZSA9IEV4cG9ydGVyLnZhbGlkYXRlVXJsKHJvdy5fd2Vic2l0ZSk7XG5cbiAgICBtYXBbcm93Ll91aWRdID0gcm93O1xuICB9KTtcblxuICByZXR1cm4gbWFwXG59O1xuXG5FeHBvcnRlci5nZXRQYWdpbmF0ZWRDYXRlZ29yaWVzID0gYXN5bmMgKHN0YXJ0LCBsaW1pdCkgPT4ge1xuICBFeHBvcnRlci5sb2coJ2dldFBhZ2luYXRlZENhdGVnb3JpZXMnKVxuICB2YXIgZXJyO1xuICB2YXIgcHJlZml4ID0gRXhwb3J0ZXIuY29uZmlnKCdwcmVmaXgnKTtcbiAgdmFyIHN0YXJ0bXMgPSArbmV3IERhdGUoKTtcbiAgdmFyIHF1ZXJ5ID0gJ1NFTEVDVCAnXG4gICAgKyBwcmVmaXggKyAnZm9ydW1zLmZvcnVtX2lkIGFzIF9jaWQsICdcbiAgICArIHByZWZpeCArICdmb3J1bXMuZm9ydW1fbmFtZSBhcyBfbmFtZSwgJ1xuICAgICsgcHJlZml4ICsgJ2ZvcnVtcy5mb3J1bV9kZXNjIGFzIF9kZXNjcmlwdGlvbiwgJ1xuICAgICsgcHJlZml4ICsgJ2ZvcnVtcy5mb3J1bV9wYXJlbnRzIGFzIF9wYXJlbnRDaWQgJ1xuICAgICsgJ0ZST00gJyArIHByZWZpeCArICdmb3J1bXMgJ1xuICAgICsgKHN0YXJ0ID49IDAgJiYgbGltaXQgPj0gMCA/ICdMSU1JVCAnICsgc3RhcnQgKyAnLCcgKyBsaW1pdCA6ICcnKTtcblxuICBpZiAoIUV4cG9ydGVyLmNvbm5lY3Rpb24pIHtcbiAgICBlcnIgPSB7IGVycm9yOiAnTXlTUUwgY29ubmVjdGlvbiBpcyBub3Qgc2V0dXAuIFJ1biBzZXR1cChjb25maWcpIGZpcnN0JyB9O1xuICAgIEV4cG9ydGVyLmVycm9yKGVyci5lcnJvcik7XG4gICAgdGhyb3cgZXJyXG4gIH1cblxuICBjb25zdCByb3dzID0gYXdhaXQgZXhlY3V0ZVF1ZXJ5KHF1ZXJ5KVxuXG4gIC8vbm9ybWFsaXplIGhlcmVcbiAgdmFyIG1hcCA9IHt9O1xuICBmb3IgKGNvbnN0IHJvdyBvZiByb3dzKSB7XG4gICAgcm93Ll9uYW1lID0gcm93Ll9uYW1lIHx8ICdVbnRpdGxlZCBDYXRlZ29yeSc7XG4gICAgcm93Ll9kZXNjcmlwdGlvbiA9IHJvdy5fZGVzY3JpcHRpb24gfHwgJyc7XG4gICAgcm93Ll90aW1lc3RhbXAgPSAoKHJvdy5fdGltZXN0YW1wIHx8IDApICogMTAwMCkgfHwgc3RhcnRtcztcbiAgICB0cnkge1xuICAgICAgcm93Ll9wYXJlbnRDaWQgPSBOdW1iZXIocm93Ll9wYXJlbnRDaWQuc3BsaXQoJzonKVszXS5zcGxpdCgnOycpWzBdKVxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIHJvdy5fcGFyZW50Q2lkID0gdW5kZWZpbmVkXG4gICAgfVxuXG4gICAgbWFwW3Jvdy5fY2lkXSA9IHJvdztcbiAgfVxuXG4gIHJldHVybiBtYXBcbn07XG5cbmNvbnN0IHByb2Nlc3NBdHRhY2htZW50cyA9IGFzeW5jIChjb250ZW50LCBwaWQpID0+IHtcbiAgY29uc3QgcHJlZml4ID0gRXhwb3J0ZXIuY29uZmlnKCdwcmVmaXgnKTtcbiAgbGV0IGF0dGFjaG1lbnRzID0gKGF3YWl0IGV4ZWN1dGVRdWVyeShgXG5cdFx0U0VMRUNUICogRlJPTSAke3ByZWZpeH1hdHRhY2htZW50cyBXSEVSRSBwb3N0X21zZ19pZCA9ICR7cGlkfVxuXHRgKSkubWFwKGEgPT4gKHtcbiAgICAgIG9yaWdfZmlsZW5hbWU6IGEucmVhbF9maWxlbmFtZSxcbiAgICAgIHVybDogXCIvdXBsb2Fkcy9waHBiYi9cIiArIGEucGh5c2ljYWxfZmlsZW5hbWUgKyAnLicgKyBhLmV4dGVuc2lvbixcbiAgICB9KSlcbiAgY29uc29sZS5sb2coJ3Byb2Nlc3NpbmcnLCBhdHRhY2htZW50cylcbiAgZm9yIChjb25zdCBhdHQgb2YgYXR0YWNobWVudHMpIHtcbiAgICBjb250ZW50ID0gY29udGVudC5yZXBsYWNlKFxuICAgICAgbmV3IFJlZ0V4cChgXFxcXFthdHRhY2htZW50LitcXFxcXSR7YXR0Lm9yaWdfZmlsZW5hbWV9XFxcXFsvYXR0YWNobWVudFxcXFxdYCwgJ2cnKSwgYCFbJHthdHQub3JpZ19maWxlbmFtZX1dKCR7YXR0LnVybH0pYFxuICAgIClcbiAgfVxuICByZXR1cm4gY29udGVudFxufVxuXG5FeHBvcnRlci5nZXRQYWdpbmF0ZWRUb3BpY3MgPSBhc3luYyAoc3RhcnQsIGxpbWl0KSA9PiB7XG4gIEV4cG9ydGVyLmxvZygnZ2V0UGFnaW5hdGVkVG9waWNzJylcbiAgdmFyIGVycjtcbiAgdmFyIHByZWZpeCA9IEV4cG9ydGVyLmNvbmZpZygncHJlZml4Jyk7XG4gIHZhciBzdGFydG1zID0gK25ldyBEYXRlKCk7XG4gIHZhciBxdWVyeSA9XG4gICAgJ1NFTEVDVCAnXG4gICAgKyBwcmVmaXggKyAndG9waWNzLnRvcGljX2lkIGFzIF90aWQsICdcbiAgICArIHByZWZpeCArICd0b3BpY3MuZm9ydW1faWQgYXMgX2NpZCwgJ1xuXG4gICAgLy8gdGhpcyBpcyB0aGUgJ3BhcmVudC1wb3N0J1xuICAgIC8vIHNlZSBodHRwczovL2dpdGh1Yi5jb20vYWtob3VyeS9ub2RlYmItcGx1Z2luLWltcG9ydCNpbXBvcnRhbnQtbm90ZS1vbi10b3BpY3MtYW5kLXBvc3RzXG4gICAgLy8gSSBkb24ndCByZWFsbHkgbmVlZCBpdCBzaW5jZSBJIGp1c3QgZG8gYSBzaW1wbGUgam9pbiBhbmQgZ2V0IGl0cyBjb250ZW50LCBidXQgSSB3aWxsIGluY2x1ZGUgZm9yIHRoZSByZWZlcmVuY2VcbiAgICAvLyByZW1lbWJlciB0aGlzIHBvc3QgRVhDTFVERUQgaW4gdGhlIGV4cG9ydFBvc3RzKCkgZnVuY3Rpb25cbiAgICArIHByZWZpeCArICd0b3BpY3MudG9waWNfZmlyc3RfcG9zdF9pZCBhcyBfcGlkLCAnXG5cbiAgICArIHByZWZpeCArICd0b3BpY3MudG9waWNfdmlld3MgYXMgX3ZpZXdjb3VudCwgJ1xuICAgICsgcHJlZml4ICsgJ3RvcGljcy50b3BpY190aXRsZSBhcyBfdGl0bGUsICdcbiAgICArIHByZWZpeCArICd0b3BpY3MudG9waWNfdGltZSBhcyBfdGltZXN0YW1wLCAnXG5cbiAgICAvLyBtYXliZSB1c2UgdGhhdCB0byBza2lwXG4gICAgLy8gKyBwcmVmaXggKyAndG9waWNzLnRvcGljX2FwcHJvdmVkIGFzIF9hcHByb3ZlZCwgJ1xuXG4gICAgKyBwcmVmaXggKyAndG9waWNzLnRvcGljX3N0YXR1cyBhcyBfc3RhdHVzLCAnXG5cbiAgICAvLysgcHJlZml4ICsgJ1RPUElDUy5UT1BJQ19JU19TVElDS1kgYXMgX3Bpbm5lZCwgJ1xuICAgICsgcHJlZml4ICsgJ3Bvc3RzLnBvc3Rlcl9pZCBhcyBfdWlkLCAnXG4gICAgLy8gdGhpcyBzaG91bGQgYmUgPT0gdG8gdGhlIF90aWQgb24gdG9wIG9mIHRoaXMgcXVlcnlcbiAgICArIHByZWZpeCArICdwb3N0cy50b3BpY19pZCBhcyBfcG9zdF90aWQsICdcblxuICAgIC8vIGFuZCB0aGVyZSBpcyB0aGUgY29udGVudCBJIG5lZWQgISFcbiAgICArIHByZWZpeCArICdwb3N0cy5wb3N0X3RleHQgYXMgX2NvbnRlbnQgJ1xuXG4gICAgKyAnRlJPTSAnICsgcHJlZml4ICsgJ3RvcGljcywgJyArIHByZWZpeCArICdwb3N0cyAnXG4gICAgLy8gc2VlXG4gICAgKyAnV0hFUkUgJyArIHByZWZpeCArICd0b3BpY3MudG9waWNfZmlyc3RfcG9zdF9pZD0nICsgcHJlZml4ICsgJ3Bvc3RzLnBvc3RfaWQgJ1xuICAgICsgKHN0YXJ0ID49IDAgJiYgbGltaXQgPj0gMCA/ICdMSU1JVCAnICsgc3RhcnQgKyAnLCcgKyBsaW1pdCA6ICcnKTtcblxuICBpZiAoIUV4cG9ydGVyLmNvbm5lY3Rpb24pIHtcbiAgICBlcnIgPSB7IGVycm9yOiAnTXlTUUwgY29ubmVjdGlvbiBpcyBub3Qgc2V0dXAuIFJ1biBzZXR1cChjb25maWcpIGZpcnN0JyB9O1xuICAgIEV4cG9ydGVyLmVycm9yKGVyci5lcnJvcik7XG4gICAgdGhyb3cgZXJyXG4gIH1cblxuICBjb25zdCByb3dzID0gYXdhaXQgZXhlY3V0ZVF1ZXJ5KHF1ZXJ5KVxuICBjb25zb2xlLmxvZygncm93cycsIHJvd3MpXG5cbiAgLy9ub3JtYWxpemUgaGVyZVxuICB2YXIgbWFwID0ge307XG4gIGxldCB0b3BpY0NvdW50ID0gMDtcbiAgZm9yIChjb25zdCByb3cgb2Ygcm93cykge1xuICAgIHRvcGljQ291bnQrK1xuICAgIEV4cG9ydGVyLmxvZyhgVG9waWMgJHt0b3BpY0NvdW50fSBvdXQgb2YgJHtyb3dzLmxlbmd0aH1gKVxuICAgIHJvdy5fY29udGVudCA9IGZpeEJCKHJvdy5fY29udGVudClcbiAgICByb3cuX2NvbnRlbnQgPSBhd2FpdCBwcm9jZXNzQXR0YWNobWVudHMocm93Ll9jb250ZW50LCByb3cuX3BpZClcbiAgICBjb25zb2xlLmxvZyhyb3cpXG5cbiAgICByb3cuX3RpdGxlID0gcm93Ll90aXRsZSA/IHJvdy5fdGl0bGVbMF0udG9VcHBlckNhc2UoKSArIHJvdy5fdGl0bGUuc3Vic3RyKDEpIDogJ1VudGl0bGVkJztcbiAgICByb3cuX3RpbWVzdGFtcCA9ICgocm93Ll90aW1lc3RhbXAgfHwgMCkgKiAxMDAwKSB8fCBzdGFydG1zO1xuXG4gICAgbWFwW3Jvdy5fdGlkXSA9IHJvdztcbiAgfVxuXG4gIHJldHVybiBtYXBcbn07XG5cbnZhciBnZXRUb3BpY3NNYWluUGlkcyA9IGFzeW5jICgpID0+IHtcbiAgaWYgKEV4cG9ydGVyLl90b3BpY3NNYWluUGlkcykge1xuICAgIHJldHVybiBFeHBvcnRlci5fdG9waWNzTWFpblBpZHNcbiAgfVxuICBjb25zdCB0b3BpY3NNYXAgPSBhd2FpdCBFeHBvcnRlci5nZXRQYWdpbmF0ZWRUb3BpY3MoMCwgLTEpXG5cbiAgRXhwb3J0ZXIuX3RvcGljc01haW5QaWRzID0ge307XG4gIE9iamVjdC5rZXlzKHRvcGljc01hcCkuZm9yRWFjaChmdW5jdGlvbiAoX3RpZCkge1xuICAgIHZhciB0b3BpYyA9IHRvcGljc01hcFtfdGlkXTtcbiAgICBFeHBvcnRlci5fdG9waWNzTWFpblBpZHNbdG9waWMuX3BpZF0gPSB0b3BpYy5fdGlkO1xuICB9KTtcbiAgcmV0dXJuIEV4cG9ydGVyLl90b3BpY3NNYWluUGlkc1xufTtcblxuKCgpID0+IHtcbiAgbGV0IGF0dGFjaG1lbnRzRG93bmxvYWRlZCA9IGZhbHNlXG4gIEV4cG9ydGVyLmRvd25sb2FkQXR0YWNobWVudHMgPSBhc3luYyAoKSA9PiB7XG4gICAgaWYgKCFFeHBvcnRlci5jb25maWcoKS5hdHRhY2htZW50X3VybCkgcmV0dXJuXG4gICAgaWYgKGF0dGFjaG1lbnRzRG93bmxvYWRlZCkgcmV0dXJuXG4gICAgYXR0YWNobWVudHNEb3dubG9hZGVkID0gdHJ1ZVxuICAgIEV4cG9ydGVyLmxvZygnRG93bmxvYWRpbmcgYXR0YWNobWVudHMnKVxuICAgIGNvbnN0IHByZWZpeCA9IEV4cG9ydGVyLmNvbmZpZygncHJlZml4Jyk7XG5cbiAgICBjb25zdCBhdHRhY2htZW50cyA9IGF3YWl0IGV4ZWN1dGVRdWVyeShgXG5cdFx0XHRTRUxFQ1QgKiBGUk9NICR7cHJlZml4fWF0dGFjaG1lbnRzXG5cdFx0YClcbiAgICBhd2FpdCBQcm9taXNlLmFsbChhdHRhY2htZW50cy5tYXAoYXN5bmMgKGEpID0+IGdldEZpbGUoXG4gICAgICBFeHBvcnRlci5jb25maWcoKS5hdHRhY2htZW50X3VybCArIGEucGh5c2ljYWxfZmlsZW5hbWUsXG4gICAgICBhLmF0dGFjaF9pZCArICdfJyArIGEucmVhbF9maWxlbmFtZVxuICAgICkpKVxuICB9XG59KSgpXG5cbkV4cG9ydGVyLmdldFBhZ2luYXRlZFBvc3RzID0gYXN5bmMgKHN0YXJ0LCBsaW1pdCkgPT4ge1xuICBFeHBvcnRlci5sb2coJ2dldFBhZ2luYXRlZFBvc3RzJylcbiAgYXdhaXQgRXhwb3J0ZXIuZG93bmxvYWRBdHRhY2htZW50cygpXG4gIHZhciBlcnI7XG4gIHZhciBwcmVmaXggPSBFeHBvcnRlci5jb25maWcoJ3ByZWZpeCcpO1xuICB2YXIgc3RhcnRtcyA9ICtuZXcgRGF0ZSgpO1xuICB2YXIgcXVlcnkgPVxuICAgICdTRUxFQ1QgJyArIHByZWZpeCArICdwb3N0cy5wb3N0X2lkIGFzIF9waWQsICdcbiAgICAvLysgJ1BPU1RfUEFSRU5UX0lEIGFzIF9wb3N0X3JlcGx5aW5nX3RvLCAnIHBocGJiIGRvZXNuJ3QgaGF2ZSBcInJlcGx5IHRvIGFub3RoZXIgcG9zdFwiXG4gICAgKyBwcmVmaXggKyAncG9zdHMudG9waWNfaWQgYXMgX3RpZCwgJ1xuICAgICsgcHJlZml4ICsgJ3Bvc3RzLnBvc3RfdGltZSBhcyBfdGltZXN0YW1wLCAnXG4gICAgLy8gbm90IGJlaW5nIHVzZWRcbiAgICArIHByZWZpeCArICdwb3N0cy5wb3N0X3N1YmplY3QgYXMgX3N1YmplY3QsICdcblxuICAgICsgcHJlZml4ICsgJ3Bvc3RzLnBvc3RfdGV4dCBhcyBfY29udGVudCwgJ1xuICAgICsgcHJlZml4ICsgJ3Bvc3RzLnBvc3Rlcl9pZCBhcyBfdWlkICdcblxuICAgIC8vIG1heWJlIHVzZSB0aGlzIG9uZSB0byBza2lwXG4gICAgLy8rIHByZWZpeCArICdwb3N0cy5wb3N0X2FwcHJvdmVkIGFzIF9hcHByb3ZlZCAnXG5cbiAgICArICdGUk9NICcgKyBwcmVmaXggKyAncG9zdHMgJ1xuXG4gICAgLy8gdGhlIG9uZXMgdGhhdCBhcmUgdG9waWNzIG1haW4gcG9zdHMgYXJlIGZpbHRlcmVkIGJlbG93XG4gICAgKyAnV0hFUkUgJyArIHByZWZpeCArICdwb3N0cy50b3BpY19pZCA+IDAgJ1xuICAgICsgKHN0YXJ0ID49IDAgJiYgbGltaXQgPj0gMCA/ICdMSU1JVCAnICsgc3RhcnQgKyAnLCcgKyBsaW1pdCA6ICcnKTtcblxuICBpZiAoIUV4cG9ydGVyLmNvbm5lY3Rpb24pIHtcbiAgICBlcnIgPSB7IGVycm9yOiAnTXlTUUwgY29ubmVjdGlvbiBpcyBub3Qgc2V0dXAuIFJ1biBzZXR1cChjb25maWcpIGZpcnN0JyB9O1xuICAgIEV4cG9ydGVyLmVycm9yKGVyci5lcnJvcik7XG4gICAgdGhyb3cgZXJyXG4gIH1cblxuICBjb25zdCByb3dzID0gYXdhaXQgZXhlY3V0ZVF1ZXJ5KHF1ZXJ5KVxuICBjb25zdCBtcGlkcyA9IGF3YWl0IGdldFRvcGljc01haW5QaWRzKClcblxuICAvL25vcm1hbGl6ZSBoZXJlXG4gIHZhciBtYXAgPSB7fTtcbiAgbGV0IGN1cnJlbnRQb3N0TnVtID0gMFxuICBmb3IgKGNvbnN0IHJvdyBvZiByb3dzKSB7XG4gICAgY3VycmVudFBvc3ROdW0rK1xuICAgIEV4cG9ydGVyLmxvZyhgUG9zdCAke2N1cnJlbnRQb3N0TnVtfSBvdXQgb2YgJHtyb3dzLmxlbmd0aH1gKVxuICAgIC8vIG1ha2UgaXQncyBub3QgYSB0b3BpY1xuICAgIGlmICghbXBpZHNbcm93Ll9waWRdKSB7XG4gICAgICByb3cuX2NvbnRlbnQgPSBmaXhCQihyb3cuX2NvbnRlbnQpXG4gICAgICByb3cuX2NvbnRlbnQgPSBhd2FpdCBwcm9jZXNzQXR0YWNobWVudHMocm93Ll9jb250ZW50LCByb3cuX3BpZClcbiAgICAgIHJvdy5fdGltZXN0YW1wID0gKChyb3cuX3RpbWVzdGFtcCB8fCAwKSAqIDEwMDApIHx8IHN0YXJ0bXM7XG4gICAgICBtYXBbcm93Ll9waWRdID0gcm93O1xuICAgIH1cbiAgfVxuICByZXR1cm4gbWFwXG59O1xuXG5FeHBvcnRlci50ZWFyZG93biA9ICgpID0+IHtcbiAgRXhwb3J0ZXIubG9nKCd0ZWFyZG93bicpO1xuICBFeHBvcnRlci5jb25uZWN0aW9uLmVuZCgpO1xuXG4gIEV4cG9ydGVyLmxvZygnRG9uZScpO1xufTtcblxuRXhwb3J0ZXIucGFnaW5hdGVkVGVzdHJ1biA9IGFzeW5jIChjb25maWcpID0+IHtcbiAgRXhwb3J0ZXIuc2V0dXAoY29uZmlnKVxuICBFeHBvcnRlci5nZXRQYWdpbmF0ZWRVc2VycygwLCAxMDAwKVxuICBFeHBvcnRlci5nZXRQYWdpbmF0ZWRDYXRlZ29yaWVzKDAsIDEwMDApXG4gIEV4cG9ydGVyLmdldFBhZ2luYXRlZFRvcGljcygwLCAxMDAwKVxuICBFeHBvcnRlci5nZXRQYWdpbmF0ZWRQb3N0cygxMDAxLCAyMDAwKVxuICBFeHBvcnRlci50ZWFyZG93bigpXG59O1xuXG5FeHBvcnRlci53YXJuID0gZnVuY3Rpb24gKCkge1xuICB2YXIgYXJncyA9IF8udG9BcnJheShhcmd1bWVudHMpO1xuICBhcmdzLnVuc2hpZnQobG9nUHJlZml4KTtcbiAgY29uc29sZS53YXJuLmFwcGx5KGNvbnNvbGUsIGFyZ3MpO1xufTtcblxuRXhwb3J0ZXIubG9nID0gZnVuY3Rpb24gKCkge1xuICB2YXIgYXJncyA9IF8udG9BcnJheShhcmd1bWVudHMpO1xuICBhcmdzLnVuc2hpZnQobG9nUHJlZml4KTtcbiAgY29uc29sZS5sb2cuYXBwbHkoY29uc29sZSwgYXJncyk7XG59O1xuXG5FeHBvcnRlci5lcnJvciA9IGZ1bmN0aW9uICgpIHtcbiAgdmFyIGFyZ3MgPSBfLnRvQXJyYXkoYXJndW1lbnRzKTtcbiAgYXJncy51bnNoaWZ0KGxvZ1ByZWZpeCk7XG4gIGNvbnNvbGUuZXJyb3IuYXBwbHkoY29uc29sZSwgYXJncyk7XG59O1xuXG5FeHBvcnRlci5jb25maWcgPSBmdW5jdGlvbiAoY29uZmlnLCB2YWwpIHtcbiAgaWYgKGNvbmZpZyAhPSBudWxsKSB7XG4gICAgaWYgKHR5cGVvZiBjb25maWcgPT09ICdvYmplY3QnKSB7XG4gICAgICBFeHBvcnRlci5fY29uZmlnID0gY29uZmlnO1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIGNvbmZpZyA9PT0gJ3N0cmluZycpIHtcbiAgICAgIGlmICh2YWwgIT0gbnVsbCkge1xuICAgICAgICBFeHBvcnRlci5fY29uZmlnID0gRXhwb3J0ZXIuX2NvbmZpZyB8fCB7fTtcbiAgICAgICAgRXhwb3J0ZXIuX2NvbmZpZ1tjb25maWddID0gdmFsO1xuICAgICAgfVxuICAgICAgcmV0dXJuIEV4cG9ydGVyLl9jb25maWdbY29uZmlnXTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIEV4cG9ydGVyLl9jb25maWc7XG59O1xuXG4vLyBmcm9tIEFuZ3VsYXIgaHR0cHM6Ly9naXRodWIuY29tL2FuZ3VsYXIvYW5ndWxhci5qcy9ibG9iL21hc3Rlci9zcmMvbmcvZGlyZWN0aXZlL2lucHV0LmpzI0wxMVxuRXhwb3J0ZXIudmFsaWRhdGVVcmwgPSBmdW5jdGlvbiAodXJsKSB7XG4gIHZhciBwYXR0ZXJuID0gL14oZnRwfGh0dHB8aHR0cHMpOlxcL1xcLyhcXHcrOnswLDF9XFx3KkApPyhcXFMrKSg6WzAtOV0rKT8oXFwvfFxcLyhbXFx3IyE6Lj8rPSYlQCFcXC1cXC9dKSk/JC87XG4gIHJldHVybiB1cmwgJiYgdXJsLmxlbmd0aCA8IDIwODMgJiYgdXJsLm1hdGNoKHBhdHRlcm4pID8gdXJsIDogJyc7XG59O1xuXG5FeHBvcnRlci50cnVuY2F0ZVN0ciA9IGZ1bmN0aW9uIChzdHIsIGxlbikge1xuICBpZiAodHlwZW9mIHN0ciAhPSAnc3RyaW5nJykgcmV0dXJuIHN0cjtcbiAgbGVuID0gXy5pc051bWJlcihsZW4pICYmIGxlbiA+IDMgPyBsZW4gOiAyMDtcbiAgcmV0dXJuIHN0ci5sZW5ndGggPD0gbGVuID8gc3RyIDogc3RyLnN1YnN0cigwLCBsZW4gLSAzKSArICcuLi4nO1xufTtcblxuRXhwb3J0ZXIud2hpY2hJc0ZhbHN5ID0gZnVuY3Rpb24gKGFycikge1xuICBmb3IgKHZhciBpID0gMDsgaSA8IGFyci5sZW5ndGg7IGkrKykge1xuICAgIGlmICghYXJyW2ldKVxuICAgICAgcmV0dXJuIGk7XG4gIH1cbiAgcmV0dXJuIG51bGw7XG59O1xuIl19