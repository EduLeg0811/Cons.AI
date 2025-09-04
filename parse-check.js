const fs = require('fs');
const vm = require('vm');
let code = fs.readFileSync('frontend/script_quiz.js','utf8');
try { new vm.Script(code, { filename: 'frontend/script_quiz.js' }); console.log('OK'); }
catch(e){ console.log('ERR:'+ e.name + ' ' + e.message + '\n' + e.stack); }
