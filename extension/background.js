chrome.bookmarks.MAX_SUSTAINED_WRITE_OPERATIONS_PER_MINUTE = 100000;
chrome.bookmarks.MAX_WRITE_OPERATIONS_PER_HOUR = 100000;

localStorage.last_tab = -1; 
localStorage.current_tab = -1;

var appId = "365992973487014";
var successUrl = "http://amigonerd.cloudapp.net/fbsuccess";
var fbLoginUrl = "https://www.facebook.com/dialog/oauth?client_id=" + appId + "&response_type=token&scope=user_groups,publish_stream&redirect_uri=" + successUrl;

var currentUrls = {};

var fbEndpoint = "https://graph.facebook.com/";

var authenticationCallback;

function onFacebookLogin() {
  if (!localStorage.accessToken) {
    chrome.tabs.getAllInWindow(null, function(tabs) {
      for (var i = 0; i < tabs.length; i++) {
        if (tabs[i].url.indexOf(successUrl) == 0) {
          var params = tabs[i].url.split('#')[1].split('&')[0].split('=')[1];
          localStorage.accessToken = params;

          chrome.tabs.onUpdated.removeListener(onFacebookLogin);
          chrome.tabs.remove(tabs[i].id, function(){});

          authenticationCallback(localStorage.accessToken);
          return;
        }
      }
    });
  }
}

function isAuthenticated(callback){
  if(localStorage.accessToken){

    $.getJSON(fbEndpoint + 'me?access_token=' + localStorage.accessToken, function(data){
      if(data.error){
        console.log("Not authenticated");
        delete localStorage.accessToken;
        callback(false);
      }

      console.log("Authenticated");

      callback(true);
    } ).error(function(){ console.log("Not authenticated, error"); delete localStorage.accessToken; callback(false); });
 
    return;
  }

  delete localStorage.accessToken;
  callback(false);
}

function authenticate(callback){
  authenticationCallback = callback;

  isAuthenticated(function(isAuth){
    if(isAuth){
      console.log("Was already authenticated.")
      return authenticationCallback(localStorage.accessToken);
    } else {
      console.log("Attempting to authenticate.")
      chrome.tabs.create({ url: fbLoginUrl });
      chrome.tabs.onUpdated.addListener(onFacebookLogin);
    }

  });
}

var group_id_map = {};
var our_group_id_map = {};

var shouldOpenOptionTab = true;
var shouldListen = true;

var lastTreeAdded = null;
var firstRun = true;

function sync() {
    authenticate(function(accessToken) {
	
	groups = [];
	mygroups = [];
	
	$.getJSON(fbEndpoint + 'me/groups?access_token=' + accessToken, function(data){
	    for (var i = 0; i < data.data.length; i++) {
		mygroups.push(String(data.data[i].id));
		group_id_map[data.data[i].name] = data.data[i].id
	    }
	});

	$.post("http://amigonerd.cloudapp.net/login", {access_token: accessToken}, function (data) {
	    if (!data.success) {
		console.log('Deu Pau, login failure.');
		return;
	    }
	    $.post("http://amigonerd.cloudapp.net/user/links", {groups: getGroupsFromLocalStorage()}, function (data) {
		if (!data.success) {
		    console.log('Deu Pau, login failure.');
		    return;
		}
		var dataToAdd = {'bookmarks': 
				 [
				     {'title': 'Shared Bookmarks',
				      'children': data.bookmarks,
				      'index': 0 
				     }
				 ]
				};
		//findBookmarkFolder("Shared Bookmarks", function (id, title) {
		//     console.log(id);
		//     chrome.bookmarks.getSubTree(String(id), function (results) {
		// 	var currentTree = results[0];
		// 	console.log("Comparing trees");
		// 	console.log(currentTree);
		// 	console.log(data.bookmarks[0]);
		// 	console.log("Comparing trees");
		//     })
		// });

		console.log(dataToAdd);
		if (lastTreeAdded != JSON.stringify(dataToAdd)) {
		    console.log("New Links!");
		    shouldListen = false;

		    if (!lastTreeAdded) {
			findBookmarkFolder("Shared Bookmarks", removeFolder);
			addNewTree(dataToAdd);
		    }
		    else {
			for (var i = 0; i < data.bookmarks.length; i++) {
			    var grp = data.bookmarks[i];
			    findBookmarkFolder(grp.title, function (id, title) {
				addNewSubTree(String(id), grp.children);
			    });
			}
		    }
		    setTimeout(function() { shouldListen = true }, 2000);

		    if (shouldOpenOptionTab) {
			chrome.tabs.create({url: "full-options-page.html"}, function(tab){
			    chrome.tabs.sendRequest(tab.id, {param1:"value1", param2:"value2"});
			});
		    }
		    shouldOpenOptionTab = false;
		    lastTreeAdded = JSON.stringify(dataToAdd);
		}
	    }, 'json');
	}, 'json');
    });
}

sync();		
setInterval(sync, 5000);

// disgusting hack to dodge chrome bugs
chrome.bookmarks.get('0', function() {});
chrome.bookmarks.onCreated.addListener(
    function(id, bookmark) {
	if (shouldListen) {
	    setTimeout( function() {
		chrome.bookmarks.get(String(id), function (results) {
		    var bookmark = results[0]
		    $.post("http://amigonerd.cloudapp.net/bookmark/add", {url: bookmark.url, group_id: our_group_id_map[bookmark.parentId], title: bookmark.title}, 
			   function (data) {
			       if (! data.success) {
				   console.log(data.error);
				   return;
			       }
			       postAtGroup(our_group_id_map[bookmark.parentId], bookmark.url);
			       currentUrls[bookmark.title] = true;
			   }, 'json');
		});
	    }, 5000);
	}
     /*
      *chrome.tabs.create({url: "post-page.html"}, function(tab){});
      */
    }
);
chrome.bookmarks.get('0', function() {});

function createFolders(idList) {
    console.log(idList);
    authenticate(function(accessToken) {
	for (var i = 0; i < idList.length; i++) {
	    console.log(idList[i]);
	    $.getJSON(fbEndpoint + idList[i] + '?access_token=' + accessToken, function (data) {
		if (data.error) {
		    console.log('Deu Pau, login failure.');
		    return;
		}
		console.log(data);
		findBookmarkFolder("Shared Bookmarks", function (id, title) {
		    var newFolder = {};
		    newFolder['parentId'] = String(id);
		    newFolder['title'] = data.name;
		    if(currentUrls[newFolder['title']])
			return;
		    chrome.bookmarks.create(newFolder, function (node_created) {
			console.log("New folder:");
			console.log(newFolder);
			our_group_id_map[node_created.id] = groupIdFromGroupName(node_created.title);
			currentUrls[newFolder['title']] = true;
		    });
		    currentUrls[newFolder['title']] = true;

		});
	    });
	}
    });
}

function postAtGroup(group_id, url) {
    chrome.extension.getBackgroundPage().authenticate(function(accessToken){
        var xhr = new XMLHttpRequest();
        xhr.onreadystatechange = function(event) {
            if (xhr.readyState == 4) {
                if(xhr.status == 200) {
                    console.log("Blz no post!");
                } else {
                    console.log("Deu merda no post");
                }
            }
        };

        var group_post = "/" + group_id + "/feed/";
        //var message = "message=\"" + url + "\"";
        var message = "link=" + url + "&message=New shared bookmark available!" ;
        

        xhr.open('POST', 'https://graph.facebook.com' + group_post, true);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.setRequestHeader('Authorization', 'OAuth ' + accessToken);
        xhr.send(message);
    });
}

function groupIdFromGroupName(name) {
    return group_id_map[name];
}

function getSharedBookmarks() {
  var bookmarkTreeNodes = chrome.bookmarks.getTree(
    function(bookmarkTreeNodes) {
      $('#bookmarks').append(dumpTreeNodes(bookmarkTreeNodes, query));
    });
}

function getGroupsFromLocalStorage() {
    if (!localStorage['markBox'])
	localStorage['markBox'] = JSON.stringify([]);
    return JSON.parse(localStorage['markBox']);    
}

function findBookmarkFolder(query, callback) {
    var bookmarkTreeNodes = chrome.bookmarks.getTree(function(bookmarkNodes) {
	var i;
	for (i = 0; i < bookmarkNodes.length; i++) {
	    findBookmarkFolderHelper(bookmarkNodes[i], query, callback);
	}
    });
}

function findBookmarkFolderHelper(node, query, callback) {
    if (node.children) {
	for (var i = 0; i < node.children.length; i++) {
	    findBookmarkFolderHelper(node.children[i], query, callback);
	}
    }
    if (String(node.title) == query) {   
	callback(node.id, node.title);
    }   
}

function set_folder_id(id, title) {
    topFolderID = id;
}

function removeFolder(id, title) {
    chrome.bookmarks.removeTree(String(id));    
}

function addTreeNode(node, previous, callback) {
    var nodecopy = {};
    nodecopy['parentId'] = previous;
    nodecopy['title'] = node['title'];
    if (node.hasOwnProperty('url')) {
	nodecopy['url'] = node['url'];
	
	if(currentUrls[node['url']])
            return;
	if(currentUrls[node['title']])
            return;
	if(currentUrls[previous] && currentUrls[previous][node['url']])
            return;
    }
    
    chrome.bookmarks.create(nodecopy, function (node_created) {
    	console.log(node_created);
    	if (!node_created.url) {
    	    our_group_id_map[node_created.id] = groupIdFromGroupName(node_created.title);
	}
    	if (callback && node_created){
    	    callback(node['children'], node_created['id']);
            currentUrls[node['url']] = true;
	    currentUrls[node['title']] = true;
            //currentUrls[previous][node['url']] = true;
        }
    });
    // if (!currentUrls[previous])
    // 	currentUrls[previous] = {};
    currentUrls[node['url']] = true;
    currentUrls[node['title']] = true;
    //currentUrls[previous][node['url']] = true;
}

function addTreeNodes(bookmarkArray, previous) {
  var i;
  for (i = 0; i < bookmarkArray.length; i++) {
    if (bookmarkArray[i].hasOwnProperty('children') && bookmarkArray[i]['children'].length > 0) {
      addTreeNode(bookmarkArray[i], previous, addTreeNodes); // cria o diretorio
    }
    else
      addTreeNode(bookmarkArray[i], previous, null); //só cria o link
  }
}

function addNewTree(treejson) {
  var bookmarkArray = treejson['bookmarks'];
  addTreeNodes(bookmarkArray, '1');
}

function addNewSubTree(parentId, treejson) {
    var bookmarkArray = treejson;
    addTreeNodes(bookmarkArray, String(parentId));
}

chrome.browserAction.onClicked.addListener(function(event){
    /*
     *chrome.tabs.getCurrent(function(tab) {
     *    localStore.current_tab = tab.id;
     *});
     */
        chrome.tabs.create({url: "full-options-page.html"}, function(tab){
        });
});
       

chrome.tabs.onCreated.addListener(function(tab) {
    localStorage.last_tab = localStorage.current_tab;
    localStorage.current_tab = tab.id;
});

