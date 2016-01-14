
var async = require('async');
var mysql = require('mysql');
var _ = require('underscore');
var Entities = require('html-entities').AllHtmlEntities;
var entities = new Entities();
var noop = function(){};
var logPrefix = '[nodebb-plugin-import-phpbb]';

(function(Exporter) {

    Exporter.setup = function(config, callback) {
        Exporter.log('setup');

        // mysql db only config
        // extract them from the configs passed by the nodebb-plugin-import adapter
        var _config = {
            host: config.dbhost || config.host || 'localhost',
            user: config.dbuser || config.user || 'root',
            password: config.dbpass || config.pass || config.password || '',
            port: config.dbport || config.port || 3306,
            database: config.dbname || config.name || config.database || 'phpbb'
        };

        Exporter.config(_config);
        Exporter.config('prefix', config.prefix || config.tablePrefix || '' /* phpbb_ ? */ );

        Exporter.connection = mysql.createConnection(_config);
        Exporter.connection.connect();

        callback(null, Exporter.config());
    };

    Exporter.getUsers = function(callback) {
        return Exporter.getPaginatedUsers(0, -1, callback);
    };
    Exporter.getPaginatedUsers = function(start, limit, callback) {
        callback = !_.isFunction(callback) ? noop : callback;

        var err;
        var prefix = Exporter.config('prefix');
        var startms = +new Date();
        var query = 'SELECT '
            + prefix + 'users.user_id as _uid, '
            + prefix + 'users.username as _username, '
            + prefix + 'users.username_clean as _alternativeUsername, '
            + prefix + 'users.user_email as _registrationEmail, '
            //+ prefix + 'users.user_rank as _level, '
            + prefix + 'users.user_regdate as _joindate, '
            + prefix + 'users.user_email as _email, '
            //+ prefix + 'banlist.ban_id as _banned '
            + prefix + 'users.user_sig as _signature, '
            + prefix + 'users.user_website as _website, '
            //+ prefix + 'users.USER_OCCUPATION as _occupation, '
            + prefix + 'users.user_from as _location, '
            //+ prefix + 'users.USER_AVATAR as _picture, '
            //+ prefix + 'users.USER_TITLE as _title, '
            //+ prefix + 'users.USER_RATING as _reputation, '
            //+ prefix + 'users.USER_TOTAL_RATES as _profileviews, '
            + prefix + 'users.user_birthday as _birthday '

            + 'FROM ' + prefix + 'users '
            + 'WHERE ' + prefix + 'users.user_type <> 2 AND ' + prefix + 'users.user_type <> 1 '
            + (start >= 0 && limit >= 0 ? 'LIMIT ' + start + ',' + limit : '');


        if (!Exporter.connection) {
            err = {error: 'MySQL connection is not setup. Run setup(config) first'};
            Exporter.error(err.error);
            return callback(err);
        }

        Exporter.connection.query(query,
            function(err, rows) {
                if (err) {
                    Exporter.error(err);
                    return callback(err);
                }

                //normalize here
                var map = {};
                rows.forEach(function(row) {
                    // nbb forces signatures to be less than 150 chars
                    // keeping it HTML see https://github.com/akhoury/nodebb-plugin-import#markdown-note
                    row._signature = entities.decode(Exporter.truncateStr(row._signature || '', 150));

                    // from unix timestamp (s) to JS timestamp (ms)
                    row._joindate = ((row._joindate || 0) * 1000) || startms;

                    // lower case the email for consistency
                    row._email = (row._email || '').toLowerCase();

                    // location
                    row._location = (row._location || '').trim();

                    // birthday
                    row._birthday = (row._birthday || '').split(' ').join('').replace(/(\d{2})-(\d{2})-(\d{4})/, "$2/$1/$3");

                    // I don't know about you about I noticed a lot my users have incomplete urls, urls like: http://
                    row._website = Exporter.validateUrl(row._website);

                    map[row._uid] = row;
                });

                callback(null, map);
            });
    };

    Exporter.getMessages = function(callback) {
        return Exporter.getPaginatedMessages(0, -1, callback);
    };
    Exporter.getPaginatedMessages = function(start, limit, callback) {
        callback = !_.isFunction(callback) ? noob : callback;

        var err;
        var prefix = Exporter.config('prefix');
        var startms = +new Date();
        var query = 'SELECT '
            + prefix + 'privmsgs.msg_id as _mid, '
            + prefix + 'privmsgs.author_id as _fromuid, '
            + prefix + 'privmsgs.to_address as _touid, '
            + prefix + 'privmsgs.message_text as _content, '
            + prefix + 'privmsgs.message_time as _timestamp '
            + 'FROM ' + prefix + 'privmsgs '
            + 'ORDER BY ' + prefix + 'privmsgs.message_time '
            + (start >= 0 && limit >= 0 ? 'LIMIT ' + start + ',' + limit : '');

            if(!Exporter.connection) {
                err = {error: 'MySQL connection is not setup. Run setup(config) first'};
                Exporter.error(err.error);
                return callback(err);
            }

            Exporter.connection.query(query,
                function(err, rows) {
                    if (err) {
                        Exporter.error(err);
                        return callback(err);
                    }

                    var map = {};
                    rows.forEach(function(row) {
                        row._touid = row._touid.substr(2);
                        row._content = entities.decode(row._content);
                        row._timestamp = ((row._timestamp || 0) * 1000) || startms;

                        map[row._mid] = row;
                    });

                    callback(null, map);
                });
    };

    Exporter.getCategories = function(callback) {
        return Exporter.getPaginatedCategories(0, -1, callback);    
    };
    Exporter.getPaginatedCategories = function(start, limit, callback) {
        callback = !_.isFunction(callback) ? noop : callback;

        var err;
        var prefix = Exporter.config('prefix');
        var startms = +new Date();
        var query = 'SELECT '
            + prefix + 'forums.forum_id as _cid, '
            + prefix + 'forums.forum_name as _name, '
            + prefix + 'forums.forum_desc as _description '
            + 'FROM ' + prefix + 'forums '
            + 'WHERE ' + prefix + 'forums.forum_type <> 0 '
            +  (start >= 0 && limit >= 0 ? 'LIMIT ' + start + ',' + limit : '');
            
        if (!Exporter.connection) {
            err = {error: 'MySQL connection is not setup. Run setup(config) first'};
            Exporter.error(err.error);
            return callback(err);
        }

        Exporter.connection.query(query,
            function(err, rows) {
                if (err) {
                    Exporter.error(err);
                    return callback(err);
                }

                //normalize here
                var map = {};
                rows.forEach(function(row) {
                    row._name = entities.decode(row._name || 'Untitled Category');
                    row._description = entities.decode(row._description || 'No decscription available');
                    row._timestamp = ((row._timestamp || 0) * 1000) || startms;

                    map[row._cid] = row;
                });

                callback(null, map);
            });
    };

    Exporter.getTopics = function(callback) {
        return Exporter.getPaginatedTopics(0, -1, callback);
    };
    Exporter.getPaginatedTopics = function(start, limit, callback) {
        callback = !_.isFunction(callback) ? noop : callback;

        var err;
        var prefix = Exporter.config('prefix');
        var startms = +new Date();
        var query =
            'SELECT '
            + prefix + 'topics.topic_id as _tid, '
            + prefix + 'topics.forum_id as _cid, '

            // this is the 'parent-post'
            // see https://github.com/akhoury/nodebb-plugin-import#important-note-on-topics-and-posts
            // I don't really need it since I just do a simple join and get its content, but I will include for the reference
            // remember this post EXCLUDED in the exportPosts() function
            + prefix + 'topics.topic_first_post_id as _pid, '

            + prefix + 'topics.topic_views as _viewcount, '
            + prefix + 'topics.topic_title as _title, '
            + prefix + 'topics.topic_time as _timestamp, '

            // maybe use that to skip
            + prefix + 'topics.topic_approved as _approved, '

            + prefix + 'topics.topic_status as _status, '

            //+ prefix + 'TOPICS.TOPIC_IS_STICKY as _pinned, '
            + prefix + 'posts.poster_id as _uid, '
            // this should be == to the _tid on top of this query
            + prefix + 'posts.topic_id as _post_tid, '

            // and there is the content I need !!
            + prefix + 'posts.post_text as _content '

            + 'FROM ' + prefix + 'topics, ' + prefix + 'posts '
            // see
            + 'WHERE ' + prefix + 'topics.topic_first_post_id=' + prefix + 'posts.post_id '
            + (start >= 0 && limit >= 0 ? 'LIMIT ' + start + ',' + limit : '');


        if (!Exporter.connection) {
            err = {error: 'MySQL connection is not setup. Run setup(config) first'};
            Exporter.error(err.error);
            return callback(err);
        }

        Exporter.connection.query(query,
            function(err, rows) {
                if (err) {
                    Exporter.error(err);
                    return callback(err);
                }

                //normalize here
                var map = {};
                rows.forEach(function(row) {
                    row._title = entities.decode(row._title ? row._title[0].toUpperCase() + row._title.substr(1) : 'Untitled');
                    row._timestamp = ((row._timestamp || 0) * 1000) || startms;
                    row._content = entities.decode(row._content);

                    map[row._tid] = row;
                });

                callback(null, map);
            });
    };

    Exporter.getPosts = function(callback) {
        return Exporter.getPaginatedPosts(0, -1, callback);
    };
    Exporter.getPaginatedPosts = function(start, limit, callback) {
        callback = !_.isFunction(callback) ? noop : callback;

        var err;
        var prefix = Exporter.config('prefix');
        var startms = +new Date();
        var query =
            'SELECT ' + prefix + 'posts.post_id as _pid, '
            //+ 'POST_PARENT_ID as _post_replying_to, ' phpbb doesn't have "reply to another post"
            + prefix + 'posts.topic_id as _tid, '
            + prefix + 'posts.post_time as _timestamp, '
            // not being used
            + prefix + 'posts.post_subject as _subject, '

            + prefix + 'posts.post_text as _content, '
            + prefix + 'posts.poster_id as _uid, '

            // maybe use this one to skip
            + prefix + 'posts.post_approved as _approved '

            + 'FROM ' + prefix + 'posts '

		    // remove first posts
            + 'WHERE ' + prefix + 'posts.topic_id > 0 AND ' + prefix + 'posts.post_id NOT IN (SELECT ' + prefix + 'topics.topic_first_post_id '
                + 'FROM ' + prefix + 'topics) '
            + (start >= 0 && limit >= 0 ? 'LIMIT ' + start + ',' + limit : '');

        if (!Exporter.connection) {
            err = {error: 'MySQL connection is not setup. Run setup(config) first'};
            Exporter.error(err.error);
            return callback(err);
        }

		Exporter.connection.query(query,
			function (err, rows) {
				if (err) {
					Exporter.error(err);
					return callback(err);
				}

				//normalize here
				var map = {};
				rows.forEach(function (row) {
					// make it's not a topic
					row._content = entities.decode(row._content || '');
					row._timestamp = ((row._timestamp || 0) * 1000) || startms;
					map[row._pid] = row;
				});

                callback(null, map);

			});

    };

    Exporter.teardown = function(callback) {
        Exporter.log('teardown');
        Exporter.connection.end();

        Exporter.log('Done');
        callback();
    };

    Exporter.testrun = function(config, callback) {
        async.series([
            function(next) {
                Exporter.setup(config, next);
            },
            function(next) {
                Exporter.getUsers(next);
            },
            function(next) {
                Exporter.getCategories(next);
            },
            function(next) {
                Exporter.getTopics(next);
            },
            function(next) {
                Exporter.getPosts(next);
            },
            function(next) {
                Exporter.teardown(next);
            }
        ], callback);
    };
    
    Exporter.paginatedTestrun = function(config, callback) {
        async.series([
            function(next) {
                Exporter.setup(config, next);
            },
            function(next) {
                Exporter.getPaginatedUsers(0, 1000, next);
            },
            function(next) {
                Exporter.getPaginatedCategories(0, 1000, next);
            },
            function(next) {
                Exporter.getPaginatedTopics(0, 1000, next);
            },
            function(next) {
                Exporter.getPaginatedPosts(1001, 2000, next);
            },
            function(next) {
                Exporter.teardown(next);
            }
        ], callback);
    };

    Exporter.warn = function() {
        var args = _.toArray(arguments);
        args.unshift(logPrefix);
        console.warn.apply(console, args);
    };

    Exporter.log = function() {
        var args = _.toArray(arguments);
        args.unshift(logPrefix);
        console.log.apply(console, args);
    };

    Exporter.error = function() {
        var args = _.toArray(arguments);
        args.unshift(logPrefix);
        console.error.apply(console, args);
    };

    Exporter.config = function(config, val) {
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
    Exporter.validateUrl = function(url) {
        var pattern = /^(ftp|http|https):\/\/(\w+:{0,1}\w*@)?(\S+)(:[0-9]+)?(\/|\/([\w#!:.?+=&%@!\-\/]))?$/;
        return url && url.length < 2083 && url.match(pattern) ? url : '';
    };

    Exporter.truncateStr = function(str, len) {
        if (typeof str != 'string') return str;
        len = _.isNumber(len) && len > 3 ? len : 20;
        return str.length <= len ? str : str.substr(0, len - 3) + '...';
    };

    Exporter.whichIsFalsy = function(arr) {
        for (var i = 0; i < arr.length; i++) {
            if (!arr[i])
                return i;
        }
        return null;
    };

})(module.exports);
