/* Shared browser and Node configuration. */
(function(root){
const config={version:'0.7.14',tickers:['SBER','SBERP','LKOH','GAZP','ROSN','TATN','NVTK','SNGSP','GMKN','PLZL','CHMF','NLMK','MAGN','YDEX','T','MOEX','MTSS','X5','MGNT','IRAO','MDMG','BANEP','TRNFP','AFLT','IMOEX']};
if(typeof module!=='undefined')module.exports=config;else root.PaperBotConfig=config;
})(globalThis);
