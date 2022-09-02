var myApp = angular.module('myApp', ['pascalprecht.translate']);

myApp.config(['$translateProvider', function($translateProvider) {
  $translateProvider.translations('cn', translate_cn);
	$translateProvider.translations('en', translate_en);
	$translateProvider.preferredLanguage('en');
	$translateProvider.useSanitizeValueStrategy('escape');
}]);

myApp.run(['$rootScope', '$window', '$translate', "XrpApi", 
  function($rootScope, $window, $translate, XrpApi) {
	let key = $window.localStorage['lang'] || 'en';
	$translate.use(key);
	$rootScope.lang = $translate.use();

  XrpApi.connect().then(()=>{
    console.log("Remote connected.");
  });
}]);

myApp.factory('SettingFactory', function($window) {
	return {
		setLang : function(lang) {
			$window.localStorage['lang'] = lang;
		},
		getLang : function() {
			return $window.localStorage['lang'] || 'en';
		}
	};
});

myApp.controller("LangCtrl", [ '$scope', '$rootScope', '$translate', 'SettingFactory',
  function($scope, $rootScope, $translate, SettingFactory) {
  $rootScope.lang = $translate.use();
	$scope.changeLanguage = function (key) {
      $translate.use(key);
      $rootScope.lang = $translate.use();
	    SettingFactory.setLang(key);
	};
}]);

myApp.controller("TokenCtrl", [ '$scope', '$rootScope', "XrpApi",
  function($scope, $rootScope, XrpApi) {

  $scope.validateIssuer = function() {
    if (!$scope.issuer || !XrpApi.isValidSecret($scope.issuer)) {
      $scope.issuer_address = "";
      $scope.error_issuer = "error_secret";
      return;
    }
    var address = XrpApi.getAddress($scope.issuer);
    $scope.issuer_address = address;
    $scope.error_issuer = "checking";    
    XrpApi.checkBalances(address).then(balances => {
      let native = getBalance(balances, "XRP");
      if (native < 9999) {
        $scope.error_issuer = "error_xag";
        $scope.$apply();
        return;
      }
      return XrpApi.checkTrustlines(address);
    }).then(lines => {
      if (!isEmpty(lines)) {
        $scope.error_issuer = "error_lines";
        $scope.$apply();
        return;
      }
      $scope.error_issuer = "";
      $scope.$apply();
    }).catch(e => {
      $scope.error_issuer = "error_xag";
      $scope.$apply();
    });
  };

  $scope.validateHotwallet = function() {
    if (!$scope.hotwallet || $scope.hotwallet == $scope.issuer || !XrpApi.isValidSecret($scope.hotwallet)) {
      $scope.hotwallet_address = "";
      $scope.error_hot = "error_secret";
      return;
    }
    var address = XrpApi.getAddress($scope.hotwallet);
    $scope.hotwallet_address = address;
    $scope.error_hot = "checking";    
    XrpApi.checkBalances(address).then(balances => {
      let native = getBalance(balances, "XRP");
      if (native < 9999) {
        $scope.error_hot = "error_xag";
      } else {
        $scope.error_hot = "";
      }      
      $scope.$apply();
    }).catch(e => {
      $scope.error_hot = "error_xag";
      $scope.$apply();
    });
  };

  $scope.validateCode = function() {
    let blacklist = ["XRP", "XAG", "USDT", "RIPPLE", "XLM", "ETH", "BTC"];
    if (!$scope.code || $scope.code.length < 3 || $scope.code.length > 12 || blacklist.indexOf($scope.code.toUpperCase()) >= 0) {
      $scope.error_code = "error_code";
      return;
    }
    $scope.error_code = "";

  };

  $scope.issuerToken = function() {
    var settings = {
      defaultRipple : true
    };
    $scope.msg = "Update issuer ...";
    XrpApi.changeSettings(settings, $scope.issuer).then(result => {
      $scope.msg = "Update hotwallet";
      $scope.$apply();
      return XrpApi.changeTrust($scope.code, $scope.issuer_address, 1000000000, $scope.hotwallet);
    }).then(result => {
      $scope.msg = "Payment ...";      
      $scope.$apply();
      let amount = {
        currency : $scope.code,
        counterparty : $scope.issuer_address,
        value : 1000000000
      }
      return XrpApi.payment($scope.hotwallet_address, amount, $scope.issuer);
    }).then(result => {
      $scope.msg = "OK: " + result;      
      $scope.$apply();
    }).catch(err => {
        $scope.msg = "Fail: " + err.message;
        console.error("issuerToken", err);
        $scope.$apply();
      });
  };
  
  $scope.validateIssuer();
  $scope.validateHotwallet();
  $scope.validateCode();

  function getBalance(balances, code, issuer) {
    code = realCode(code);
    let asset = balances.find(x => {
      return code == 'XRP' ? x.currency == 'XRP' : x.currency == code && x.counterparty == issuer;
    });
    return asset ? Number(asset.value) : 0;
  }

}]);

function hexToAscii(hex) {
    var str = "";
    for (var i=0; i < hex.length; i+=2) {
        var code = parseInt(hex.substr(i, 2), 16);
        if (code > 0) {
          str += String.fromCharCode(code);
        }
    }
    return str;
};

function asciiToHex(str) {
  var hex = "";
  for(var i = 0; i < str.length; i++) {
    var code = str.charCodeAt(i);
    var n = code.toString(16);
    hex += n.length < 2 ? '0' + n : n;
  }
  return (hex + "0000000000000000000000000000000000000000").substring(0, 40).toUpperCase();;
};

function realCode(input) {
    return input && input.length > 3 && input.length <= 20 ? asciiToHex(input) : input;
}

function fmtCode(input) {
  return input && input.length == 40 ? hexToAscii(input) : input;
}

function key(code, issuer) {
  if (!code) {
    return "NONE";
  }
  code = realCode(code);
  return code == 'XRP' || code == 'XAG' ? code : code + '.' + issuer;
};

function isEmpty(obj) {
  return !Object.keys(obj).length;
}