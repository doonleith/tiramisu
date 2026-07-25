const categories={expense:[['Rent / mortgage','⌂','#b9a4f8'],['Council tax','⌁','#98b9f5'],['Gas & electric','⚡','#f1c761'],['Water','≈','#78c8c8'],['Internet & mobile','◌','#98b9f5'],['Insurance','◇','#ffb07c'],['Debt payments','↘','#ff8566'],['Savings','✦','#9bd7ba'],['Subscriptions','◒','#b9a4f8'],['Groceries','🛒','#9bd7ba'],['Transport','↗','#98b9f5'],['Health','+','#78c8c8'],['Other','·','#b9b6ae']],income:[['Salary','↗','#9bd7ba'],['Freelance','✦','#98b9f5'],['Benefits','+','#b9a4f8'],['Interest','◌','#f1c761'],['Other','·','#b9b6ae']]};
const $=id=>document.getElementById(id);
const money=value=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(value);
const localDate=(date=new Date())=>{const offset=date.getTimezoneOffset()*60000;return new Date(date.getTime()-offset).toISOString().slice(0,10)};
const categoryInfo=(category,type)=>categories[type].find(item=>item[0]===category)||categories[type].at(-1);
const escapeHtml=value=>{const node=document.createElement('div');node.textContent=value;return node.innerHTML};
let month=new Date(),transactions=[],ledgers=[],activeLedgerId=null,client,user;month.setDate(1);

function monthKey(){return `${month.getFullYear()}-${String(month.getMonth()+1).padStart(2,'0')}`}
function monthTransactions(){return transactions.filter(transaction=>transaction.date.startsWith(monthKey()))}
function fillCategories(type,selected){const options=categories[type],choices=selected&&!options.some(([name])=>name===selected)?[...options,[selected,'·','#b9b6ae']]:options;$('category').innerHTML=choices.map(([name])=>`<option ${name===selected?'selected':''}>${name}</option>`).join('')}
function ordinal(day){const endings=['th','st','nd','rd'],remainder=day%100;return `${day}${endings[(remainder-20)%10]||endings[remainder]||endings[0]}`}
function fillMonthlyDays(selectedDay){$('monthly-day').innerHTML=Array.from({length:31},(_,index)=>index+1).map(day=>`<option value="${day}" ${day===selectedDay?'selected':''}>${ordinal(day)} of the month</option>`).join('')}
function syncDateFields(){const repeating=$('repeat-monthly').checked;$('date-field').hidden=repeating;$('monthly-day-field').hidden=!repeating;$('date').required=!repeating}
function recurringStartDate(day){const today=new Date(),lastDay=new Date(today.getFullYear(),today.getMonth()+1,0).getDate();return localDate(new Date(today.getFullYear(),today.getMonth(),Math.min(day,lastDay),12))}
function recurringDate(rule){const start=new Date(`${rule.start_date}T12:00:00`),year=month.getFullYear(),monthIndex=month.getMonth();if(new Date(year,monthIndex+1,0)<start)return null;const lastDay=new Date(year,monthIndex+1,0).getDate();return localDate(new Date(year,monthIndex,Math.min(start.getDate(),lastDay),12))}

function renderTabs(){
  $('tabs').innerHTML=ledgers.map(ledger=>`<button class="tab" type="button" role="tab" aria-selected="${ledger.id===activeLedgerId}" data-ledger="${ledger.id}">${escapeHtml(ledger.name)}</button>`).join('');
}

function render(){
  const current=monthTransactions(),income=current.filter(item=>item.type==='income').reduce((sum,item)=>sum+item.amount,0),spent=current.filter(item=>item.type==='expense').reduce((sum,item)=>sum+item.amount,0);
  $('income').textContent=money(income);$('spent').textContent=money(spent);$('balance').textContent=money(income-spent);$('detail').textContent=income?`${money(spent)} of ${money(income)} received has been spent.`:'Add income and expenses to get started.';$('total').textContent=`${money(spent)} spent`;
  const grouped=current.filter(item=>item.type==='expense').reduce((all,item)=>{all[item.category]=(all[item.category]||0)+item.amount;return all},{}),entries=Object.entries(grouped).sort((a,b)=>b[1]-a[1]);
  $('breakdown').innerHTML=entries.length?entries.map(([category,amount])=>{const[,,colour]=categoryInfo(category,'expense');return `<div class="row"><span>${category}</span><div class="bar"><span style="width:${amount/spent*100}%;background:${colour}"></span></div><span>${money(amount)}</span></div>`}).join(''):'<div class="empty">Your category totals will appear here<br>when you add an expense.</div>';
  const recent=[...transactions].sort((a,b)=>b.date.localeCompare(a.date));
  $('transactions').innerHTML=recent.length?recent.map(item=>{const[,icon,colour]=categoryInfo(item.category,item.type),detail=item.recurringTransactionId?`${item.category} · Monthly`:`${item.category} · ${new Date(`${item.date}T12:00:00`).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}`;return `<div class="transaction"><span class="icon" style="background:${colour}38">${icon}</span><div><b>${escapeHtml(item.note||item.category)}</b><small>${detail}</small></div><em class="${item.type==='income'?'positive':''}">${item.type==='income'?'+':'−'}${money(item.amount)}</em><button data-edit="${item.id}" aria-label="Edit transaction">✎</button></div>`}).join(''):'<div class="empty">No transactions yet.<br>Start by adding your first one.</div>';
}

async function loadLedgers(){
  let {data,error}=await client.from('ledgers').select('*').order('created_at');if(error)throw error;
  if(!data.length){const result=await client.from('ledgers').insert({user_id:user.id,name:'Personal'}).select().single();if(result.error)throw result.error;data=[result.data]}
  ledgers=data;const saved=localStorage.getItem('tiramisu-active-ledger');activeLedgerId=ledgers.some(ledger=>ledger.id===saved)?saved:ledgers[0].id;localStorage.setItem('tiramisu-active-ledger',activeLedgerId);renderTabs();
}

async function materializeRecurring(){
  const {data:rules,error}=await client.from('recurring_transactions').select('*').eq('active',true).eq('ledger_id',activeLedgerId);if(error)throw error;
  const {data:existing,error:transactionError}=await client.from('transactions').select('recurring_transaction_id,transaction_date').eq('ledger_id',activeLedgerId);if(transactionError)throw transactionError;
  const keys=new Set(existing.filter(item=>item.recurring_transaction_id).map(item=>`${item.recurring_transaction_id}:${item.transaction_date}`));
  const newOccurrences=rules.map(rule=>({rule,date:recurringDate(rule)})).filter(({rule,date})=>date&&!keys.has(`${rule.id}:${date}`)).map(({rule,date})=>({user_id:user.id,ledger_id:activeLedgerId,type:rule.type,amount:rule.amount,category:rule.category,note:rule.note,transaction_date:date,recurring_transaction_id:rule.id}));
  if(newOccurrences.length){const{error:insertError}=await client.from('transactions').insert(newOccurrences);if(insertError)throw insertError}
}

async function load(){
  if(!user||!activeLedgerId)return;
  try{await materializeRecurring();const{data,error}=await client.from('transactions').select('*').eq('ledger_id',activeLedgerId).order('transaction_date',{ascending:false});if(error)throw error;transactions=data.map(item=>({id:item.id,type:item.type,amount:Number(item.amount),category:item.category,date:item.transaction_date,note:item.note||'',recurringTransactionId:item.recurring_transaction_id}));render()}catch(error){alert(`Could not load your transactions: ${error.message}`)}
}

function openForm(transaction,selectedType){
  if(!user)return signIn();const editing=Boolean(transaction),type=transaction?.type||selectedType||'expense',date=transaction?.date||localDate();$('form').reset();$('id').value=transaction?.id||'';$('type').value=type;$('form-title').textContent=editing?'Edit transaction':`Add ${type}`;$('form-note').textContent=editing?'Update entry':`New ${type}`;fillCategories(type,transaction?.category);$('amount').value=transaction?.amount||'';$('date').value=date;$('note').value=transaction?.note||'';$('repeat-monthly').checked=editing?Boolean(transaction?.recurringTransactionId):true;fillMonthlyDays(Number(date.slice(-2)));syncDateFields();$('delete').style.visibility=editing?'visible':'hidden';if(!$('dialog').open)$('dialog').showModal();$('amount').focus()
}

async function switchLedger(id){if(id===activeLedgerId)return;activeLedgerId=id;localStorage.setItem('tiramisu-active-ledger',id);renderTabs();await load()}
async function createLedger(name){const{data,error}=await client.from('ledgers').insert({user_id:user.id,name}).select().single();if(error)throw error;ledgers.push(data);activeLedgerId=data.id;localStorage.setItem('tiramisu-active-ledger',activeLedgerId);renderTabs();await load()}

async function setUser(nextUser){
  user=nextUser;$('user').hidden=!user;$('landing').hidden=Boolean(user);$('app-view').hidden=!user;
  if(user){$('name').textContent=user.user_metadata.full_name||user.email;try{await loadLedgers();await load()}catch(error){alert(`Could not open your money tabs: ${error.message}`)}}else{transactions=[];ledgers=[];activeLedgerId=null;$('tabs').innerHTML='';render()}
}

async function signIn(){if(!client)return alert('The app is still loading. Please try again.');const{error}=await client.auth.signInWithOAuth({provider:'google',options:{redirectTo:`${location.origin}${location.pathname}?v=21`}});if(error)alert(`Google sign-in could not start: ${error.message}`)}

async function initialize(){
  if('serviceWorker'in navigator)navigator.serviceWorker.getRegistrations().then(registrations=>registrations.forEach(registration=>registration.unregister()));
  if(!window.CLEAR_SUPABASE_URL)return render();client=supabase.createClient(CLEAR_SUPABASE_URL,CLEAR_SUPABASE_ANON_KEY,{auth:{detectSessionInUrl:false}});
  const tokens=new URLSearchParams(location.hash.slice(1)),accessToken=tokens.get('access_token'),refreshToken=tokens.get('refresh_token');let session;
  if(accessToken&&refreshToken){const{data,error}=await client.auth.setSession({access_token:accessToken,refresh_token:refreshToken});history.replaceState({},'',location.pathname);if(error)alert(`Google sign-in could not be completed: ${error.message}`);session=data?.session}
  if(!session){const{data}=await client.auth.getSession();session=data.session}await setUser(session?.user);client.auth.onAuthStateChange((_,nextSession)=>setUser(nextSession?.user));
}

document.querySelectorAll('.add').forEach(button=>button.onclick=()=>openForm(null,button.dataset.type));$('close').onclick=()=>$('dialog').close();$('close-tab').onclick=()=>$('tab-dialog').close();$('new-tab').onclick=()=>{$('tab-form').reset();$('tab-dialog').showModal();$('tab-name').focus()};$('tabs').onclick=event=>{const id=event.target.closest('[data-ledger]')?.dataset.ledger;if(id)switchLedger(id)};$('transactions').onclick=event=>{const id=event.target.dataset.edit;if(id)openForm(transactions.find(item=>item.id===id))};$('repeat-monthly').onchange=syncDateFields;$('landing-sign-in').onclick=signIn;$('sign-out').onclick=()=>client?.auth.signOut();
$('tab-form').onsubmit=async event=>{event.preventDefault();const name=$('tab-name').value.trim();if(!name)return;try{await createLedger(name);$('tab-dialog').close()}catch(error){alert(`Could not create this tab: ${error.message}`)}};
$('form').onsubmit=async event=>{event.preventDefault();const id=$('id').value,amount=Number($('amount').value.replace(',','.'));if(!amount||amount<0)return;const type=$('type').value,repeat=$('repeat-monthly').checked,saveAnother=event.submitter?.id==='save-another',transactionDate=repeat?recurringStartDate(Number($('monthly-day').value)):$('date').value,existing=transactions.find(item=>item.id===id);let recurringId=existing?.recurringTransactionId||null;const details={user_id:user.id,ledger_id:activeLedgerId,type,amount,category:$('category').value,note:$('note').value.trim()||null,start_date:transactionDate};try{if(repeat&&recurringId){const{error}=await client.from('recurring_transactions').update(details).eq('id',recurringId);if(error)throw error}else if(repeat){const{data,error}=await client.from('recurring_transactions').insert(details).select().single();if(error)throw error;recurringId=data.id}else if(recurringId){const{error}=await client.from('recurring_transactions').update({active:false}).eq('id',recurringId);if(error)throw error;recurringId=null}const item={user_id:user.id,ledger_id:activeLedgerId,type,amount,category:details.category,transaction_date:details.start_date,note:details.note,recurring_transaction_id:recurringId};const result=id?await client.from('transactions').update(item).eq('id',id):await client.from('transactions').insert(item);if(result.error)throw result.error;await load();if(saveAnother)openForm(null,type);else $('dialog').close()}catch(error){alert(`Could not save this transaction: ${error.message}`)}};
$('delete').onclick=async()=>{const id=$('id').value,existing=transactions.find(item=>item.id===id);if(!id)return;const message=existing?.recurringTransactionId?'Stop this monthly payment and delete this occurrence?':'Delete this transaction?';if(!confirm(message))return;try{if(existing?.recurringTransactionId){const{error}=await client.from('recurring_transactions').update({active:false}).eq('id',existing.recurringTransactionId);if(error)throw error}const{error}=await client.from('transactions').delete().eq('id',id);if(error)throw error;$('dialog').close();await load()}catch(error){alert(`Could not delete this transaction: ${error.message}`)}};
initialize();
