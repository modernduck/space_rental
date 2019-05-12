var admin = require("firebase-admin");

var serviceAccount = require("../serviceAccount.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://infinityminingweb.firebaseio.com"
});
var util = require('util');




module.exports = {
  doImport: doImport,
  doExport: doExport,
  getProductTypes:getProductTypes,
  getStat: getStat
};

function addTransaction(values, action ){
  console.log('values', values)
  return admin.firestore().collection('transactions').add({
    action,
    token:values.token,
    product:values.name,
    volume:values.volume,
    createAt:(new Date())
  })
}

function importItem(values){
  return admin.firestore().collection('storage').doc(values.token).collection('products').doc(values.name).collection('imports').add({
    product:values.name,
    volume:values.volume,
    createAt:(new Date())
  }).then(ref => ref.id)
    
}

function exportItem(token, product, importKey){
  var now = new Date();
  var actualResult;
  return admin.firestore().collection('storage').doc(token).collection('products').doc(product).collection('imports').doc(importKey).get().then(snap => {
    var info = snap.data();
    console.log('info.createAt', info.createAt)
    var diffTime = now.getTime() - (new Date(info.createAt._seconds * 1000)).getTime();
    console.log("=====>diffTIme", diffTime)
    var diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
    var price = calculatePrice(info.product, info.volume, diffDays);
    actualResult =  {
      ...info,
      price,
      days:diffDays,
      exportAt:now
    }
    return actualResult;
    
  }).then(info => admin.firestore().collection('storage').doc(token).collection('products').doc(product).collection('exports').add(info))
  .then(result => admin.firestore().collection('storage').doc(token).collection('products').doc(product).collection('imports').doc(importKey).delete())
  .then(result2 => actualResult);
}

function getProductCount(values){ 
  return admin.firestore().collection('storage').doc(values.token).collection('products').doc(values.name).collection('transactions').get().then(snaps =>{
    var count = 0;
    snaps.forEach(snap => {
      var p = snap.data()
      count += p.volume
    })
    return count;
  })
}

function calculatePrice(product_name, volume, days){
  //fix code//all volume in sqCM
  var price = 0;
  switch(product_name){
    case "supplement":
      for(var i=0; i < days;i ++){
        price += volume * Math.pow(2, i);
      }
      return price;
    case "cloth":
      //20 บาท ต่อ น้ำหนัก 1 กิโลกรัม | 100kg : 1sq M
      //2,000 THB : 1 sqM  : 10000 sqcm
      //0.2 THB : 1 sqcm
      price = days * (0.2 * volume)
      return price;
    case "other":
      //10 thb : 1 sqm : 10000 sqcm
      //0.001 THB : 1 sqcm
      price = 0.001 * volume * days
      return price;
  }
}

 function addProductStock(product, addedVolume) {
  return admin.firestore().collection('products').doc(product).get().then(snap => {
    p = snap.data();
    p.volume += addedVolume
    return admin.firestore().collection('products').doc(product).update({volume: p.volume})
  })
}

function removeProductStock (product, removeVolume, newProfit) {
  return admin.firestore().collection('products').doc(product).get().then(snap => {
    p = snap.data();
    p.volume -= removeVolume
    p.profit += newProfit
    return admin.firestore().collection('products').doc(product).update({volume: p.volume, profit: p.profit })
  })
}

/*Controller */

function doImport(req, res) {
  // variables defined in the Swagger document can be referenced using req.swagger.params.{parameter_name}
  var importKey ;
  addProductStock(req.swagger.params.product.value.name , req.swagger.params.product.value.volume)
  .then(result => importItem(req.swagger.params.product.value))
  .then(ks => {
      importKey = ks;
      return addTransaction(  req.swagger.params.product.value, 'import')
  })
  .then(result => {
    console.log('result', result);
    console.log('answer => ', {key:importKey, name:req.swagger.params.product.value.name, volume:req.swagger.params.product.value.volume})
    res.json({key:importKey, name:req.swagger.params.product.value.name, volume:req.swagger.params.product.value.volume});
  })
  // this sends back a JSON response which is a single string

  
}


function doExport(req, res) {
    // variables defined in the Swagger document can be referenced using req.swagger.params.{parameter_name}
    var exportResult

    exportItem(req.swagger.params.product.value.token, req.swagger.params.product.value.name, req.swagger.params.product.value.key).then(rs => {
      exportResult = rs;
      return removeProductStock(req.swagger.params.product.value.name, rs.volume, rs.price);
    })
    .then(result => addTransaction( {...exportResult, token:req.swagger.params.product.value.token, name:req.swagger.params.product.value.name}, 'export'))
    .then(result => {
     
      console.log('result', result);
      //need to fix this (add days, price)
      res.json({key:req.swagger.params.product.value.key, name:req.swagger.params.product.value.name, volume:exportResult.volume, price:exportResult.price, days:exportResult.days});
    })
  }
  



function getProductTypes(req, res) {
  // variables defined in the Swagger document can be referenced using req.swagger.params.{parameter_name}
  console.log(req.swagger.params)
  var products = [];
  admin.firestore().collection('products').get().then(snaps => {

      snaps.forEach(snap => {
          products.push(snap.data().name)
      })
      return products;
  }).then(products => res.json(products))
  // this sends back a JSON response which is a single string  
}

function getStat(req, res){
  
  admin.firestore().collection('products').get().then(snaps => {
    var stats = [];
    snaps.forEach(snap => {
      stats.push(snap.data())

    })
    return stats
  }).then(stats => res.json(stats))
}
