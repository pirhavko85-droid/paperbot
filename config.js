/* Shared browser and Node configuration. */
(function(root){
const config={version:'0.8.3.9.4',tickers:['SBER','SBERP','LKOH','GAZP','ROSN','TATN','NVTK','SNGSP','GMKN','PLZL','CHMF','NLMK','MAGN','YDEX','T','MOEX','MTSS','X5','MGNT','IRAO','MDMG','BANEP','TRNFP','AFLT','DOMRF','IMOEX']};
config.isRussianShare=x=>Boolean(x.SECID&&/^(1|2|common_share|preferred_share)$/i.test(String(x.SECTYPE||''))&&/^RU/i.test(String(x.ISIN||'')));
if(typeof module!=='undefined')module.exports=config;else root.PaperBotConfig=config;
})(globalThis);
