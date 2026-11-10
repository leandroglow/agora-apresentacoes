import {requireMasterAuth} from '../auth.mjs';
import {getGoogleDriveAccessToken} from '../google.mjs';
import {setCors,handleOptions,json} from '../http.mjs';
import {createExpenseRepository} from '../expense-followup.mjs';
import {checkAvailability,summarizeExpenses} from '../operations.mjs';
let serviceCache;
export default async function handler(req,res) {
 setCors(req,res);if(handleOptions(req,res))return;
 if(req.method!=='GET')return json(res,405,{error:'Método não permitido.'});
 if(!await requireMasterAuth(req,res))return;
 const [expenses,services]=await Promise.allSettled([
  (async()=>summarizeExpenses(await createExpenseRepository(await getGoogleDriveAccessToken()).records()))(),
  (async()=>{if(!serviceCache||serviceCache.until<Date.now())serviceCache={until:Date.now()+60000,result:checkAvailability()};return serviceCache.result;})()
 ]);
 return json(res,200,{checkedAt:new Date().toISOString(),expenses:expenses.status==='fulfilled'?expenses.value:null,expenseError:expenses.status==='fulfilled'?null:'Não foi possível atualizar a fila de documentos. Tente novamente.',services:services.status==='fulfilled'?services.value:[],scope:'Disponibilidade e acompanhamento documental. Não certifica segurança, funcionamento dos dispositivos ou restauração.'});
}
