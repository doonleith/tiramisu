const categories={expense:[['Groceries','🛒','#9bd7ba'],['Eating out','☕','#ffb07c'],['Transport','↗','#98b9f5'],['Bills','⌁','#b9a4f8'],['Shopping','□','#ff8566'],['Entertainment','◒','#f1c761'],['Health','+','#78c8c8'],['Other','·','#b9b6ae']],income:[['Salary','↗','#9bd7ba'],['Freelance','✦','#98b9f5'],['Gift','♡','#ffb07c'],['Other','·','#b9b6ae']]};
const $=id=>document.getElementById(id);
const money=value=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(value);
const localDate=(date=new Date())=>{const offset=date.getTimezoneOffset()*60000;return new Date(date.getTime()-offset).toISOString().slice(0,10)};
const categoryInfo=(category,type)=>categories[type].find(item=>item[0]===category)||categories[type].at(-1);
const escapeHtml=value=>{const node=document.createElement('div');node.textContent=value;return node.innerHTML};
let month=new Date(),transactions=[],client,user;month.setDate(1);

function monthKey(){return `${month.getFullYear()}-${String(month.getMonth()+1).padStart(2,'0')}`}
function monthTransactions(){return transactions.filter(transaction=>transaction.date.startsWith(monthKey()))}
function fillCategories(type,selected){$('category').innerHTML=categories[type].map(([name])=>`<option ${name===selected?'selected':''}>${name}</option>`).join('')}
function recurringDate(rule){const start=new Date(`${rule.start_date}T12:00:00`),year=month.getFullYear(),monthIndex=month.getMonth();if(new Date(year,monthIndex+1,0)<start)return null;const lastDay=new Date(year,monthIndex+1,0).getDate();return localDate(new Date(year,monthIndex,Math.min(start.getDate(),lastDay),12))}

function render(){
  const current=monthTransactions(),income=current.filter(item=>item.type==='income').reduce((sum,item)=>sum+item.amount,0),spent=current.filter(item=>item.type==='expense').reduce((sum,item)=>sum+item.amount,0);
  $('income').textContent=money(income);$('spent').textContent=money(spent);$('balance').textContent=money(income-spent);$('detail').textContent=income?`${money(spent)} of ${money(income)} received has been spent.`:'Add income and expenses to get started.';$('total').textContent=`${money(spent)} spent`;
  const grouped=current.filter(item=>item.type==='expense').reduce((all,item)=>{all[item.category]=(all[item.category]||0)+item.amount;return all},{}),entries=Object.entries(grouped).sort((a,b)=>b[1]-a[1]);
  $('breakdown').innerHTML=entries.length?entries.map(([category,amount])=>{const[,,colour]=categoryInfo(category,'expense');return `<div class="row"><span>${category}</span><div class="bar"><span style="width:${amount/spent*100}%;background:${colour}"></span></div><span>${money(amount)}</span></div>`}).join(''):'<div class="empty">Your category totals will appear here<br>when you add an expense.</div>';
  const recent=[...current].sort((a,b)=>b.date.localeCompare(a.date));
  $('transactions').innerHTML=recent.length?recent.map(item=>{const[,icon,colour]=categoryInfo(item.category,item.type),monthly=item.recurringTransactionId?' · Monthly':'';return `<div class="transaction"><span class="icon" style="background:${colour}38">${icon}</span><div><b>${escapeHtml(item.note||item.category)}</b><small>${item.category} · ${new Date(`${item.date}T12:00:00`).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}${monthly}</small></div><em class="${item.type==='income'?'positive':''}">${item.type==='income'?'+':'−'}${money(item.amount)}</em><button data-edit="${item.id}" aria-label="Edit transaction">✎</button></div>`}).join(''):'<div class="empty">No transactions for this month yet.<br>Start by adding your first one.</div>';
}

async function materializeRecurring(){
  const {data:rules,error}=await client.from('recurring_transactions').select('*').eq('active',true);if(error)throw error;
  const {data:existing,error:transactionError}=await client.from('transactions').select('recurring_transaction_id,transaction_date');if(transactionError)throw transactionError;
  const keys=new Set(existing.filter(item=>item.recurring_transaction_id).map(item=>`${item.recurring_transaction_id}:${item.transaction_date}`));
  const newOccurrences=rules.map(rule=>({rule,date:recurringDate(rule)})).filter(({rule,date})=>date&&!keys.has(`${rule.id}:${date}`)).map(({rule,date})=>({user_id:user.id,type:rule.type,amount:rule.amount,category:rule.category,note:rule.note,transaction_date:date,recurring_transaction_id:rule.id}));
  if(newOccurrences.length){const{error:insertError}=await client.from('transactions').insert(newOccurrences);if(insertError)throw insertError}
}

async function load(){
  if(!user)return;
  try{await materializeRecurring();const{data,error}=await client.from('transactions').select('*').order('transaction_date',{ascending:false});if(error)throw error;transactions=data.map(item=>({id:item.id,type:item.type,amount:Number(item.amount),category:item.category,date:item.transaction_date,note:item.note||'',recurringTransactionId:item.recurring_transaction_id}));render()}catch(error){alert(`Could not load your transactions: ${error.message}`)}
}

function openForm(transaction){
  if(!user)return signIn();const editing=Boolean(transaction);$('form').reset();$('id').value=transaction?.id||'';$('form-title').textContent=editing?'Edit transaction':'Add a transaction';$('form-note').textContent=editing?'Update entry':'New entry';document.querySelector(`input[name="type"][value="${transaction?.type||'expense'}"]`).checked=true;fillCategories(transaction?.type||'expense',transaction?.category);$('amount').value=transaction?.amount||'';$('date').value=transaction?.date||localDate();$('note').value=transaction?.note||'';$('repeat-monthly').checked=Boolean(transaction?.recurringTransactionId);$('delete').style.visibility=editing?'visible':'hidden';$('dialog').showModal();$('amount').focus()}

async function setUser(nextUser){user=nextUser;$('sign-in').hidden=Boolean(user);$('user').hidden=!user;$('landing').hidden=Boolean(user);$('app-view').hidden=!user;if(user){$('name').textContent=user.user_metadata.full_name||user.email;await load()}else{transactions=[];render()}}
async function signIn(){if(!client)return alert('The app is still loading. Please try again.');const{error}=await client.auth.signInWithOAuth({provider:'google',options:{redirectTo:`${location.origin}${location.pathname}?v=17`}});if(error)alert(`Google sign-in could not start: ${error.message}`)}

async function initialize(){
  if('serviceWorker'in navigator)navigator.serviceWorker.getRegistrations().then(registrations=>registrations.forEach(registration=>registration.unregister()));
  if(!window.CLEAR_SUPABASE_URL)return render();client=supabase.createClient(CLEAR_SUPABASE_URL,CLEAR_SUPABASE_ANON_KEY,{auth:{detectSessionInUrl:false}});
  const tokens=new URLSearchParams(location.hash.slice(1)),accessToken=tokens.get('access_token'),refreshToken=tokens.get('refresh_token');let session;
  if(accessToken&&refreshToken){const{data,error}=await client.auth.setSession({access_token:accessToken,refresh_token:refreshToken});history.replaceState({},'',location.pathname);if(error)alert(`Google sign-in could not be completed: ${error.message}`);session=data?.session}
  if(!session){const{data}=await client.auth.getSession();session=data.session}await setUser(session?.user);client.auth.onAuthStateChange((_,nextSession)=>setUser(nextSession?.user));
}

document.querySelectorAll('.add').forEach(button=>button.onclick=()=>openForm());document.querySelectorAll('input[name="type"]').forEach(input=>input.onchange=()=>fillCategories(input.value));$('close').onclick=()=>$('dialog').close();$('transactions').onclick=event=>{const id=event.target.dataset.edit;if(id)openForm(transactions.find(item=>item.id===id))};$('sign-in').onclick=signIn;$('landing-sign-in').onclick=signIn;$('sign-out').onclick=()=>client?.auth.signOut();
$('form').onsubmit=async event=>{event.preventDefault();const id=$('id').value,amount=Number($('amount').value.replace(',','.'));if(!amount||amount<0)return;const type=document.querySelector('input[name="type"]:checked').value,repeat=$('repeat-monthly').checked,existing=transactions.find(item=>item.id===id);let recurringId=existing?.recurringTransactionId||null;const details={user_id:user.id,type,amount,category:$('category').value,note:$('note').value.trim()||null,start_date:$('date').value};try{if(repeat&&recurringId){const{error}=await client.from('recurring_transactions').update(details).eq('id',recurringId);if(error)throw error}else if(repeat){const{data,error}=await client.from('recurring_transactions').insert(details).select().single();if(error)throw error;recurringId=data.id}else if(recurringId){const{error}=await client.from('recurring_transactions').update({active:false}).eq('id',recurringId);if(error)throw error;recurringId=null}const item={user_id:user.id,type,amount,category:details.category,transaction_date:details.start_date,note:details.note,recurring_transaction_id:recurringId};const result=id?await client.from('transactions').update(item).eq('id',id):await client.from('transactions').insert(item);if(result.error)throw result.error;$('dialog').close();await load()}catch(error){alert(`Could not save this transaction: ${error.message}`)}};
$('delete').onclick=async()=>{const id=$('id').value,existing=transactions.find(item=>item.id===id);if(!id)return;const message=existing?.recurringTransactionId?'Stop this monthly payment and delete this occurrence?':'Delete this transaction?';if(!confirm(message))return;try{if(existing?.recurringTransactionId){const{error}=await client.from('recurring_transactions').update({active:false}).eq('id',existing.recurringTransactionId);if(error)throw error}const{error}=await client.from('transactions').delete().eq('id',id);if(error)throw error;$('dialog').close();await load()}catch(error){alert(`Could not delete this transaction: ${error.message}`)}};
initialize();
