const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function load(chrome) {
  const context = {chrome, navigator:{language:'ja'}};
  vm.runInNewContext(fs.readFileSync('src/i18n.js','utf8'), context);
  return context.ChatTidyI18n;
}
test('Chrome catalogs resolve every manifest message with matching placeholders', () => {
  const manifest = JSON.parse(fs.readFileSync('manifest.json'));
  assert.equal(manifest.default_locale, 'en');
  for (const locale of ['en','zh_CN','zh_TW','fr','ja','ru']) {
    const catalog = JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`));
    for (const value of [manifest.name,manifest.description,manifest.action.default_title]) {
      const key = /^__MSG_(\w+)__$/.exec(value)[1];
      assert.ok(catalog[key].message);
    }
    assert.ok(catalog.extensionDescription.message.length <= 132);
    for (const entry of Object.values(catalog)) {
      for (const name of [...entry.message.matchAll(/\$([A-Z_]+)\$/g)].map(m=>m[1].toLowerCase())) {
        assert.match(entry.placeholders[name].content, /^\$[1-9]$/);
      }
    }
  }
});
test('browser locale and manual override use the appropriate translations', () => {
  const calls=[];
  const api=load({i18n:{getUILanguage:()=> 'fr-CA',getMessage:(key,args)=>{calls.push([key,args]);return key==='selected'?`${args[0]} sélectionnées`:'';}}});
  assert.equal(api.browserLanguage(),'fr');
  assert.equal(api.t('fr','selected',{n:3}),'3 sélectionnées');
  assert.equal(calls.length,1);
  assert.equal(api.t('zh-CN','selected',{n:3}),'已选 3 条');
  assert.equal(calls.length,1);
  assert.equal(api.t('en','progress',{done:2,total:5}),'Processing 2 / 5');
  assert.equal(api.t('de','delete'),'Delete');
  assert.equal(api.t('en','missing'),'missing');
});
test('locale normalization handles Chrome underscores and Chinese script/region variants', () => {
  const api=load();
  for(const lang of ['zh_TW','zh-Hant-HK','ZH-hk','zh-MO']) assert.equal(api.normalize(lang),'zh-TW');
  for(const lang of ['zh_CN','zh-Hans-CN','zh-SG']) assert.equal(api.normalize(lang),'zh-CN');
  assert.equal(api.normalize('ru_RU'),'ru');
  assert.equal(api.normalize('de-DE'),'en');
  assert.equal(api.browserLanguage(),'ja');
});
