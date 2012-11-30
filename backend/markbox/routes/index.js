// MongoDB connection

if(process.env.VCAP_SERVICES){
  var env = JSON.parse(process.env.VCAP_SERVICES);
  var mongo = env['mongodb-1.8'][0]['credentials'];
}
else{
  var mongo = {
    "hostname":"localhost",
    "port":27017,
    "username":"",
    "password":"",
    "name":"",
    "db":"db"
  }
}
var generate_mongo_url = function(obj){
  obj.hostname = (obj.hostname || 'localhost');
  obj.port = (obj.port || 27017);
  obj.db = (obj.db || 'test');
  if(obj.username && obj.password){
    return "mongodb://" + obj.username + ":" + obj.password + "@" + obj.hostname + ":" + obj.port + "/" + obj.db;
  }
  else{
    return "mongodb://" + obj.hostname + ":" + obj.port + "/" + obj.db;
  }
}

var mongourl = generate_mongo_url(mongo);


/*
 * GET home page.
 */

 var db = require('mongodb'),
 request = require('request');

 function requireLogin(req, res){
  if(!req.session.authenticated){
    res.json({ success: false, error: "Authentication required."});
    return false;
  }

  return true;
}

exports.index = function(req, res){
  res.render('index', { title: 'Express' });
};

exports.login = function(req, res){
  console.log(req.body);
  if(!req.body.access_token)
    return res.json({ success: false, error: "Missing fields"});

  request('https://graph.facebook.com/me?access_token=' + req.body.access_token, function(error, response, body){
    if(error)
      return res.json({ success: false, error: "Authentication failed", debug: error});

    var res_data = JSON.parse(body);

    if(!res_data.id)
      return res.json({ success: false, error: "Authentication failed", debug: res_data});

    req.session.access_token = req.body.access_token;
    req.session.user_id = res_data.id;
    req.session.authenticated = true;

    return res.json({ success: true, debug: res_data });
  });
}

exports.add_bookmark = function(req, res){
  if(!requireLogin(req, res)) return;

  if(!req.body.url || !req.body.group_id)
    return res.json({ success: false, error: "Missing fields"});

  db.connect(mongourl, function(err, conn){
    conn.collection('bookmarks', function(err, coll){
      var bookmark = {
        url: req.body.url,
        group_id: req.body.group_id,
        owner: req.session.user_id
      };

      coll.insert(bookmark, {safe: true}, function(err){
        if(err)
          return res.json({ success: false, error: "Server database error"});
        return res.json({ success: true });
      });

    });
  });
}

exports.user_sync = function(req, res){
  if(!requireLogin(req, res)) return;

  request('https://graph.facebook.com/me/groups?access_token=' + req.session.access_token, function(error, response, body){
    if(error) 
      return res.json({ success: false, error: "Authentication failed, login again"});

    var res_data = JSON.parse(body);

    if(!res_data.data)
      return res.json({ success: false, error: "Authentication failed, login again"});

    res_data = res_data.data;

    var groups = {}, group_ids = [];
    for(var i = 0; i < res_data.length; i++){
      group_ids.push(res_data[i].id);
      groups[res_data[i].id] = res_data[i];
    }


    var output = {};


    db.connect(mongourl, function(err, conn){
      conn.collection('bookmarks', function(err, coll){

        var cursor = coll.find({group_id:{$in: group_ids}});
        console.log(JSON.stringify( {group_id:{$in: group_ids}} ));

        cursor.toArray(function(err, items){
          if(err || !items) 
            return res.json({success: false});

          console.log(items);

          for(var i = 0; i < items.length; i++){
            var item = items[i];

            console.log(item)

            if(!output[item.group_id]){
              output[item.group_id] = {
                group_id: item.group_id,
                group_name: groups[item.group_id].name,
                bookmarks: [item]
              }

              console.log('new: ' + item.group_id);
            } else {
              output[item.group_id].bookmarks.push(item);
              console.log('old: ' + item.group_id);
            }
          }

          console.log(output);
          res.json(output);

        });
      });
    });
  });
}