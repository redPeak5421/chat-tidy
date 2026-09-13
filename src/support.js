(async()=>{
 const api=ChatTidyI18n;
 const {language}=await browser.storage.local.get({language:api.browserLanguage()});
 document.documentElement.lang=language;
 document.querySelectorAll('[data-i18n]').forEach(node=>node.textContent=api.t(language,node.dataset.i18n));
})();
