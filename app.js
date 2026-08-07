const categories={expense:[['Rent','#b9a4f8','rent-mortgage'],['Mortgage','#b9a4f8','rent-mortgage'],['Council tax','#9bbbf1','council-tax'],['Gas & electric','#f1c761','gas-electric'],['Water','#78c8c8','water'],['Internet & mobile','#b3a7e6','internet-mobile'],['Insurance','#ffb07c','insurance'],['Debt payments','#ff8566','debt-payments'],['Savings','#9bd7ba','savings'],['Disposable Income','#98b9f5','disposable-income'],['Subscriptions','#c39bde','subscriptions'],['Groceries','#a9d7a5','groceries'],['Transport','#91c2e6','transport'],['Health','#f1a9bf','health'],['Other','#b9b6ae','other']],income:[['Salary','#77c99e','salary'],['Freelance','#8fb7ed','other'],['Benefits','#c2ade6','other'],['Interest','#e6bf5e','other'],['Other','#b9b6ae','other']]};
const $=id=>document.getElementById(id);
const money=value=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(value);
const parseAmount = value => (
  Number(String(value).replace(/,/g, '').trim())
);
const localDate=(date=new Date())=>{const offset=date.getTimezoneOffset()*60000;return new Date(date.getTime()-offset).toISOString().slice(0,10)};
function setTheme(theme){const night=theme==='night';document.body.dataset.theme=night?'night':'day';localStorage.setItem('tiramisu-theme',night?'night':'day');$('theme-toggle').setAttribute('aria-pressed',String(night));$('theme-icon').textContent=night?'☀':'☾';$('theme-label').textContent=night?'Tiramisu in the morning':'Tiramisu at night'}
function initializeTheme(){setTheme(localStorage.getItem('tiramisu-theme')==='night'?'night':'day')}
const categoryInfo=(category,type)=>categories[type].find(item=>item[0]===category)||(category==='Rent / mortgage'?['Rent / mortgage','#b9a4f8','rent-mortgage']:categories[type].at(-1));
const escapeHtml=value=>{const node=document.createElement('div');node.textContent=value;return node.innerHTML};
let month=new Date(),transactions=[],ledgers=[],activeLedgerId=null,client,user,misuMessages=[],misuDraft=null,misuUpdateDraft=null;month.setDate(1);

function monthKey(){return `${month.getFullYear()}-${String(month.getMonth()+1).padStart(2,'0')}`}
function periodName(){return month.toLocaleDateString('en-GB',{month:'long',year:'numeric'})}
function monthTransactions(){return transactions.filter(transaction=>transaction.date.startsWith(monthKey()))}
function activeLedger(){return ledgers.find(ledger=>ledger.id===activeLedgerId)}
function userDisplayName(){return user?.user_metadata?.full_name||user?.email||'A member'}
function iconSvg(iconId){if(iconId==='disposable-income')return '<img class="category-art" src="assets/disposable-income-coins.svg?v=1" alt="">';if(iconId==='subscriptions')return '<img class="category-art" src="assets/subscriptions-recurring-v2.png?v=1" alt="">';return `<svg viewBox="0 0 24 24" aria-hidden="true"><use href="assets/tiramisu-category-icons.svg?v=8#${iconId}"></use></svg>`}
function tileBackground(colour,iconId){return ['disposable-income','subscriptions'].includes(iconId)?'transparent':`${colour}38`}
function renderCategoryIcon(category,type){const[,colour,iconId]=categoryInfo(category,type);$('category-icon').style.background=tileBackground(colour,iconId);$('category-icon').innerHTML=iconSvg(iconId)}
function fillCategories(type,selected){const options=categories[type],choices=selected&&!options.some(([name])=>name===selected)?[...options,[selected,'#b9b6ae','other']]:options;$('category').innerHTML=choices.map(([name])=>`<option ${name===selected?'selected':''}>${name}</option>`).join('');renderCategoryIcon($('category').value,type)}
function ordinal(day){const endings=['th','st','nd','rd'],remainder=day%100;return `${day}${endings[(remainder-20)%10]||endings[remainder]||endings[0]}`}
function fillMonthlyDays(selectedDay){$('monthly-day').innerHTML=Array.from({length:31},(_,index)=>index+1).map(day=>`<option value="${day}" ${day===selectedDay?'selected':''}>${ordinal(day)} of the month</option>`).join('')}
function syncDateFields(){const repeating=$('repeat-monthly').checked;$('date-field').hidden=repeating;$('monthly-day-field').hidden=!repeating;$('date').required=!repeating}
function recurringStartDate(day){const today=new Date(),lastDay=new Date(today.getFullYear(),today.getMonth()+1,0).getDate();return localDate(new Date(today.getFullYear(),today.getMonth(),Math.min(day,lastDay),12))}
function recurringDateInPeriod(day,periodDate){const date=new Date(`${periodDate}T12:00:00`),lastDay=new Date(date.getFullYear(),date.getMonth()+1,0).getDate();return localDate(new Date(date.getFullYear(),date.getMonth(),Math.min(day,lastDay),12))}
function recurringDate(rule){const start=new Date(`${rule.start_date}T12:00:00`),year=month.getFullYear(),monthIndex=month.getMonth();if(new Date(year,monthIndex+1,0)<start)return null;const lastDay=new Date(year,monthIndex+1,0).getDate();return localDate(new Date(year,monthIndex,Math.min(start.getDate(),lastDay),12))}

function renderTabs() {
  $('tabs').innerHTML = ledgers.map(ledger => `
    <button
      class="tab"
      type="button"
      role="tab"
      aria-selected="${ledger.id === activeLedgerId}"
      aria-controls="ledger-panel"
      data-ledger="${ledger.id}"
    >
      ${escapeHtml(ledger.name)}
    </button>
  `).join('');

  $('share-space').hidden = activeLedger()?.user_id !== user?.id;
}
function renderPeriod(){$('period-label').textContent=periodName();$('period-context').textContent=`in ${periodName()}`}

function renderMisu(){const messages=misuMessages.length?misuMessages:[{role:'assistant',content:`Hi, I’m Misu. Ask me about ${activeLedgerId?'this money space':'your money'}, or ask me to prepare a transaction.`}];$('misu-messages').innerHTML=messages.map(message=>`<div class="misu-message ${message.role==='user'?'user':'assistant'}">${escapeHtml(message.content)}</div>`).join('');$('misu-messages').scrollTop=$('misu-messages').scrollHeight;const draft=misuDraft,updateDraft=misuUpdateDraft;if(!draft&&!updateDraft){$('misu-draft').hidden=true;$('misu-draft').innerHTML='';return}$('misu-draft').hidden=false;if(updateDraft){const changes=updateDraft.updates.map(item=>`<li><b>${escapeHtml(item.note||item.category)}</b><br>${money(item.old_amount)} → ${money(item.new_amount)} · ${new Date(`${item.date}T12:00:00`).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}</li>`).join('');$('misu-draft').innerHTML=`<div class="misu-draft"><b>Ready to update</b><ul class="misu-update-list">${changes}</ul><div class="misu-draft-actions"><button type="button" data-misu-confirm-update>Confirm changes</button><button type="button" data-misu-discard>Discard</button></div></div>`;return}const schedule=draft.repeat_monthly?`Monthly · ${ordinal(Number(draft.payment_day||draft.date.slice(-2)))}`:new Date(`${draft.date}T12:00:00`).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});$('misu-draft').innerHTML=`<div class="misu-draft"><b>Ready to add</b><p>${escapeHtml(draft.category)} · ${draft.type==='income'?'Income':'Expense'} · ${money(draft.amount)}<br>${schedule}${draft.note?` · ${escapeHtml(draft.note)}`:''}</p><div class="misu-draft-actions"><button type="button" data-misu-confirm>Confirm & add</button><button type="button" data-misu-discard>Discard</button></div></div>`}
function openMisu(){if(!$('misu-dialog').open)$('misu-dialog').showModal();renderMisu();$('misu-input').focus()}
async function misuErrorMessage(error){try{const detail=await error?.context?.clone?.().json?.();if(detail?.error)return detail.error}catch{}return error?.message||'Misu could not answer right now. Please try again shortly.'}
async function askMisu(event){event.preventDefault();const input=$('misu-input'),content=input.value.trim();if(!content||!client||!activeLedgerId)return;input.value='';misuMessages.push({role:'user',content});renderMisu();$('misu-send').disabled=true;$('misu-messages').insertAdjacentHTML('beforeend','<div class="misu-message assistant pending">Misu is thinking…</div>');$('misu-messages').scrollTop=$('misu-messages').scrollHeight;try{const{data,error}=await client.functions.invoke('Misu',{body:{ledger_id:activeLedgerId,messages:misuMessages.slice(-8)}});if(error)throw error;if(data?.error)throw new Error(data.error);misuMessages.push({role:'assistant',content:data?.reply||'I’m sorry, I could not answer that.'});misuDraft=data?.draft||null;misuUpdateDraft=data?.update_draft||null;renderMisu()}catch(error){misuMessages.push({role:'assistant',content:await misuErrorMessage(error)});renderMisu()}finally{$('misu-send').disabled=false;$('misu-input').focus()}}
async function saveMisuDraft() {
  const draft = misuDraft;

  if (!draft || !user || !activeLedgerId) {
    return;
  }

  const amount = Number(draft.amount);

  // Treat model-generated data as untrusted until it passes the same checks as the form.
  if (!Number.isFinite(amount) || amount <= 0) {
    alert('Please enter a valid amount greater than zero.');
    return;
  }

  try {
    let recurringId = null;

    if (draft.repeat_monthly) {
      const { data, error } = await client
        .from('recurring_transactions')
        .insert({
          user_id: user.id,
          created_by_name: userDisplayName(),
          ledger_id: activeLedgerId,
          type: draft.type,
          amount,
          category: draft.category,
          note: draft.note || null,
          start_date: draft.date,
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      recurringId = data.id;
    }

    const { error } = await client.from('transactions').insert({
      user_id: user.id,
      created_by_name: userDisplayName(),
      ledger_id: activeLedgerId,
      type: draft.type,
      amount,
      category: draft.category,
      note: draft.note || null,
      transaction_date: draft.date,
      recurring_transaction_id: recurringId,
    });

    if (error) {
      throw error;
    }

    misuMessages.push({
      role: 'assistant',
      content: 'Saved. Your transaction is now in this money space.',
    });
    misuDraft = null;
    misuUpdateDraft = null;
    await load();
    renderMisu();
  } catch (error) {
    alert(`Could not save this transaction: ${error.message}`);
  }
}

async function splitRecurringPayment(existing, next) {
  const { data: rule, error: ruleCreateError } = await client.from('recurring_transactions').insert({ user_id: user.id, created_by_name: existing.createdByName || userDisplayName(), ledger_id: activeLedgerId, type: next.type, amount: next.amount, category: next.category, note: next.note || null, start_date: next.date }).select().single();
  if (ruleCreateError) throw ruleCreateError;
  const { error: stopError } = await client.from('recurring_transactions').update({ active: false }).eq('id', existing.recurringTransactionId);
  if (stopError) throw stopError;
  const { error: futureDeleteError } = await client.from('transactions').delete().eq('ledger_id', activeLedgerId).eq('recurring_transaction_id', existing.recurringTransactionId).gte('transaction_date', existing.date);
  if (futureDeleteError) throw futureDeleteError;
  const { error: occurrenceError } = await client.from('transactions').insert({ user_id: user.id, created_by_name: existing.createdByName || userDisplayName(), ledger_id: activeLedgerId, type: next.type, amount: next.amount, category: next.category, note: next.note || null, transaction_date: next.date, recurring_transaction_id: rule.id });
  if (occurrenceError) throw occurrenceError;
}

async function saveMisuUpdateDraft() {
  const updateDraft = misuUpdateDraft;
  if (!updateDraft?.updates?.length || !activeLedgerId) return;
  const invalid = updateDraft.updates.some(item => !item.id || !Number.isFinite(Number(item.new_amount)) || Number(item.new_amount) <= 0);
  if (invalid) { alert('One of these changes has an invalid amount.'); return; }
  try {
    for (const item of updateDraft.updates) {
      if (item.recurring_transaction_id) {
        await splitRecurringPayment({ id: item.id, recurringTransactionId: item.recurring_transaction_id, date: item.date, createdByName: item.created_by_name || '' }, { type: item.type, amount: Number(item.new_amount), category: item.category, note: item.note, date: item.date });
      } else {
        const { error } = await client.from('transactions').update({ amount: Number(item.new_amount) }).eq('id', item.id).eq('ledger_id', activeLedgerId);
        if (error) throw error;
      }
    }
    misuMessages.push({ role: 'assistant', content: `${updateDraft.updates.length===1?'That transaction has':'Those transactions have'} been updated.` });
    misuUpdateDraft = null;
    await load();
    renderMisu();
  } catch (error) { alert(`Could not update these transactions: ${error.message}`); }
}

function render(){
  const current=monthTransactions(),incomeEntries=current.filter(item=>item.type==='income'),expenses=current.filter(item=>item.type==='expense'),income=incomeEntries.reduce((sum,item)=>sum+item.amount,0),spent=expenses.reduce((sum,item)=>sum+item.amount,0),balance=income-spent;
  $('spent-title').textContent=monthKey()<new Date().toISOString().slice(0,7)?'Spent':'Spending';
  $('breakdown-context').textContent=monthKey()<new Date().toISOString().slice(0,7)?'Where it went':"Where it's going";
  $('income').textContent=money(income);$('spent').textContent=money(spent);$('balance').textContent=money(balance);$('income-detail').textContent=incomeEntries.length?`${incomeEntries.length} income ${incomeEntries.length===1?'entry':'entries'} this period`:'No income recorded yet';
  const grouped=expenses.reduce((all,item)=>{all[item.category]=(all[item.category]||0)+item.amount;return all},{}),entries=Object.entries(grouped).sort((a,b)=>b[1]-a[1]),largest=entries[0]?.[0];
  $('spent-detail').textContent=expenses.length?`${expenses.length} expense ${expenses.length===1?'entry':'entries'} this period`:'No expenses recorded yet';
  $('detail').textContent=income?`${money(spent)} spent from ${money(income)} income.`:'Add income and expenses to get started.';$('left-status').textContent=income?(balance>=0?'Remaining from this period’s income.':'Spending is above income this period.') :'';$('total').textContent=`${money(spent)} spent`;
  $('breakdown').classList.toggle('is-scrollable',entries.length>10);$('breakdown').innerHTML=entries.length?entries.map(([category,amount])=>{const[,colour,iconId]=categoryInfo(category,'expense'),other=category==='Other'?' title="Includes expenses without a more specific category"':'';return `<div class="row"${other}><span class="breakdown-label"><span class="category-tile" style="background:${tileBackground(colour,iconId)}" aria-hidden="true">${iconSvg(iconId)}</span><span>${category}</span></span><div class="bar"><span style="width:${amount/spent*100}%;background:${colour}"></span></div><span>${money(amount)}</span></div>`}).join(''):'<div class="empty">Your category totals will appear here<br>when you add an expense.</div>';
  const recent=[...current].sort((a,b)=>{const byDate=a.date.localeCompare(b.date);if(byDate)return byDate;if(a.recurringTransactionId&&b.recurringTransactionId)return a.category.localeCompare(b.category);return 0});
  const shared = activeLedger()?.memberCount > 0;

  $('transactions').classList.toggle('is-scrollable', recent.length > 10);
  $('transactions').innerHTML = recent.length
    ? recent.map(item => {
      const [, colour, iconId] = categoryInfo(item.category, item.type);
      const schedule = item.recurringTransactionId
        ? `${item.category} · Monthly · ${ordinal(Number(item.date.slice(-2)))}`
        : `${item.category} · ${new Date(`${item.date}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
      const creatorName = item.createdByName === 'Space owner' && item.userId === user?.id
        ? userDisplayName()
        : item.createdByName;
      const attribution = shared && creatorName
        ? ` · Added by ${creatorName}`
        : '';
      const detail = escapeHtml(`${schedule}${attribution}`);

      return `
        <div class="transaction">
          <span
            class="icon category-tile"
            style="background:${tileBackground(colour, iconId)}"
            aria-hidden="true"
          >
            ${iconSvg(iconId)}
          </span>
          <button
            class="transaction-main"
            data-edit="${item.id}"
            aria-label="Open ${escapeHtml(item.note || item.category)} transaction"
          >
            <b>${escapeHtml(item.note || item.category)}</b>
            <small>${detail}</small>
          </button>
          <em class="${item.type === 'income' ? 'positive' : ''}">
            ${item.type === 'income' ? '+' : '−'}${money(item.amount)}
          </em>
          <button
            class="edit-button"
            data-edit="${item.id}"
            aria-label="Edit ${escapeHtml(item.note || item.category)}"
            title="Edit transaction"
          >
            ✎
          </button>
        </div>
      `;
    }).join('')
    : '<div class="empty">No transactions in this period yet.<br>Start by adding your first one.</div>';
  renderPeriod();
}

async function loadLedgers() {
  let { data, error } = await client
    .from('ledgers')
    .select('*')
    .order('created_at');

  if (error) {
    throw error;
  }

  if (!data.length) {
    const result = await client
      .from('ledgers')
      .insert({
        user_id: user.id,
        name: 'Personal',
      })
      .select()
      .single();

    if (result.error) {
      throw result.error;
    }

    data = [result.data];
  }

  const membershipResult = await client
    .from('ledger_members')
    .select('ledger_id');

  if (membershipResult.error) {
    throw membershipResult.error;
  }

  const memberCounts = membershipResult.data.reduce((counts, member) => {
    counts[member.ledger_id] = (counts[member.ledger_id] || 0) + 1;
    return counts;
  }, {});

  ledgers = data.map(ledger => ({
    ...ledger,
    memberCount: memberCounts[ledger.id] || 0,
  }));

  const saved = localStorage.getItem('tiramisu-active-ledger');
  activeLedgerId = ledgers.some(ledger => ledger.id === saved)
    ? saved
    : ledgers[0].id;

  localStorage.setItem('tiramisu-active-ledger', activeLedgerId);
  renderTabs();
}

async function materializeRecurring() {
  const { data: rules, error } = await client
    .from('recurring_transactions')
    .select('*')
    .eq('active', true)
    .eq('ledger_id', activeLedgerId);

  if (error) {
    throw error;
  }

  // Only recurring rows can participate in the occurrence de-duplication key.
  const {
    data: existing,
    error: transactionError,
  } = await client
    .from('transactions')
    .select('recurring_transaction_id,transaction_date')
    .eq('ledger_id', activeLedgerId)
    .not('recurring_transaction_id', 'is', null);

  if (transactionError) {
    throw transactionError;
  }

  const keys = new Set(
    existing.map(item => (
      `${item.recurring_transaction_id}:${item.transaction_date}`
    )),
  );
  const newOccurrences = rules
    .map(rule => ({
      rule,
      date: recurringDate(rule),
    }))
    .filter(({ rule, date }) => (
      date && !keys.has(`${rule.id}:${date}`)
    ))
    .map(({ rule, date }) => ({
      user_id: user.id,
      created_by_name: rule.created_by_name || userDisplayName(),
      ledger_id: activeLedgerId,
      type: rule.type,
      amount: rule.amount,
      category: rule.category,
      note: rule.note,
      transaction_date: date,
      recurring_transaction_id: rule.id,
    }));

  if (newOccurrences.length) {
    const { error: insertError } = await client
      .from('transactions')
      .insert(newOccurrences);

    if (insertError) {
      throw insertError;
    }
  }
}

async function load(){if(!user||!activeLedgerId)return;try{await materializeRecurring();const{data,error}=await client.from('transactions').select('*').eq('ledger_id',activeLedgerId).order('transaction_date',{ascending:false});if(error)throw error;transactions=data.map(item=>({id:item.id,userId:item.user_id,type:item.type,amount:Number(item.amount),category:item.category,date:item.transaction_date,note:item.note||'',recurringTransactionId:item.recurring_transaction_id,createdByName:item.created_by_name||''}));render()}catch(error){alert(`Could not load your transactions: ${error.message}`)}}

function openForm(transaction,selectedType){if(!user)return signIn();const editing=Boolean(transaction),type=transaction?.type||selectedType||'expense',date=transaction?.date||localDate();$('form').reset();$('id').value=transaction?.id||'';$('type').value=type;$('form-title').textContent=editing?'Edit transaction':`Add ${type}`;$('form-note').textContent=editing?(transaction?.recurringTransactionId?'Changes apply from this month forward':'Update entry'):`New ${type}`;fillCategories(type,transaction?.category);$('amount').value=transaction?.amount||'';$('date').value=date;$('note').value=transaction?.note||'';$('repeat-monthly').checked=editing?Boolean(transaction?.recurringTransactionId):true;fillMonthlyDays(Number(date.slice(-2)));syncDateFields();$('delete').style.visibility=editing?'visible':'hidden';if(!$('dialog').open)$('dialog').showModal();$('amount').focus()}

async function switchLedger(id,keepFocus=false){if(id===activeLedgerId)return;activeLedgerId=id;misuDraft=null;misuUpdateDraft=null;misuMessages=[];localStorage.setItem('tiramisu-active-ledger',id);renderTabs();if(keepFocus)$('tabs').querySelector(`[data-ledger="${id}"]`)?.focus();await load()}
async function changePeriod(offset){month=new Date(month.getFullYear(),month.getMonth()+offset,1);await load()}
async function createLedger(name){const{data,error}=await client.from('ledgers').insert({user_id:user.id,name}).select().single();if(error)throw error;ledgers.push(data);activeLedgerId=data.id;localStorage.setItem('tiramisu-active-ledger',activeLedgerId);renderTabs();await load()}

async function renderShareMembers() {
  const { data, error } = await client
    .from('ledger_members')
    .select('user_id,display_name,role')
    .eq('ledger_id', activeLedgerId)
    .order('joined_at');

  if (error) {
    throw error;
  }

  $('share-member-list').innerHTML = data.length
    ? data.map(member => `
      <div class="share-member">
        <span>${escapeHtml(member.display_name)}</span>
        <button
          type="button"
          data-remove-member="${member.user_id}"
          aria-label="Remove ${escapeHtml(member.display_name)}"
        >
          Remove
        </button>
      </div>
    `).join('')
    : '<p class="share-empty">Only you have access right now.</p>';
}

async function openShareDialog() {
  if (activeLedger()?.user_id !== user?.id) {
    return;
  }

  $('invite-result').hidden = true;
  $('copy-status').textContent = '';
  $('share-dialog').showModal();

  try {
    await renderShareMembers();
  } catch (error) {
    alert(`Could not load this space’s members: ${error.message}`);
  }
}

async function createInvite() {
  const button = $('create-invite');
  button.disabled = true;

  try {
    const { data, error } = await client.rpc('create_ledger_invite', {
      target_ledger_id: activeLedgerId,
    });

    if (error) {
      throw error;
    }

    const inviteUrl = new URL(location.href);
    inviteUrl.hash = '';
    inviteUrl.search = '';
    inviteUrl.searchParams.set('invite', data);
    $('invite-link').value = inviteUrl.toString();
    $('invite-result').hidden = false;
    $('copy-status').textContent = 'This link expires in seven days.';
  } catch (error) {
    alert(`Could not create an invite: ${error.message}`);
  } finally {
    button.disabled = false;
  }
}

async function copyInvite() {
  const input = $('invite-link');

  try {
    await navigator.clipboard.writeText(input.value);
    $('copy-status').textContent = 'Invite link copied.';
  } catch {
    input.select();
    document.execCommand('copy');
    $('copy-status').textContent = 'Invite link copied.';
  }
}

async function removeMember(memberId) {
  if (!confirm('Remove this person from the shared space?')) {
    return;
  }

  const { error } = await client
    .from('ledger_members')
    .delete()
    .eq('ledger_id', activeLedgerId)
    .eq('user_id', memberId);

  if (error) {
    alert(`Could not remove this person: ${error.message}`);
    return;
  }

  await loadLedgers();
  await renderShareMembers();
}

async function acceptInvite(inviteId) {
  const { data, error } = await client.rpc('accept_ledger_invite', {
    invite_id: inviteId,
  });

  if (error) {
    throw error;
  }

  localStorage.setItem('tiramisu-active-ledger', data);
}

async function setUser(nextUser){user=nextUser;$('user').hidden=!user;$('header-misu').hidden=Boolean(user);$('landing').hidden=Boolean(user);$('misu-home').hidden=Boolean(user);$('app-view').hidden=!user;if(user){$('name').textContent=user.user_metadata.full_name||user.email;try{await loadLedgers();await load()}catch(error){alert(`Could not open your money spaces: ${error.message}`)}}else{transactions=[];ledgers=[];activeLedgerId=null;misuMessages=[];misuDraft=null;misuUpdateDraft=null;$('tabs').innerHTML='';render()}}
async function signIn() {
  if (!client) {
    alert('The app is still loading. Please try again.');
    return;
  }

  const { error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${location.origin}${location.pathname}${location.search}`,
    },
  });

  if (error) {
    alert(`Google sign-in could not start: ${error.message}`);
  }
}

async function initialize() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(registrations => {
      registrations.forEach(registration => registration.unregister());
    });
  }

  if (!window.CLEAR_SUPABASE_URL) {
    return render();
  }

  client = supabase.createClient(
    CLEAR_SUPABASE_URL,
    CLEAR_SUPABASE_ANON_KEY,
    {
      auth: {
        detectSessionInUrl: false,
      },
    },
  );

  const hashTokens = new URLSearchParams(location.hash.slice(1));
  const accessToken = hashTokens.get('access_token');
  const refreshToken = hashTokens.get('refresh_token');
  const inviteId = new URLSearchParams(location.search).get('invite');
  let session;

  if (accessToken && refreshToken) {
    const { data, error } = await client.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    history.replaceState({}, '', `${location.pathname}${location.search}`);

    if (error) {
      alert(`Google sign-in could not be completed: ${error.message}`);
    }

    session = data?.session;
  }

  if (!session) {
    const { data } = await client.auth.getSession();
    session = data.session;
  }

  if (session?.user && inviteId) {
    try {
      await acceptInvite(inviteId);
      history.replaceState({}, '', location.pathname);
      alert('You’ve joined the shared money space.');
    } catch (error) {
      alert(`Could not join this shared space: ${error.message}`);
    }
  }

  await setUser(session?.user);
  client.auth.onAuthStateChange((_, nextSession) => {
    setUser(nextSession?.user);
  });
}

document.querySelectorAll('.add').forEach(button=>button.onclick=()=>openForm(null,button.dataset.type));$('close').onclick=()=>$('dialog').close();$('close-tab').onclick=()=>$('tab-dialog').close();$('misu-close').onclick=()=>$('misu-dialog').close();$('misu-open').onclick=openMisu;$('theme-toggle').onclick=()=>setTheme(document.body.dataset.theme==='night'?'day':'night');initializeTheme();$('misu-form').onsubmit=askMisu;$('misu-draft').onclick=event=>{if(event.target.closest('[data-misu-confirm]'))saveMisuDraft();if(event.target.closest('[data-misu-confirm-update]'))saveMisuUpdateDraft();if(event.target.closest('[data-misu-discard]')){misuDraft=null;misuUpdateDraft=null;renderMisu()}};$('new-tab').onclick=()=>{$('tab-form').reset();$('tab-dialog').showModal();$('tab-name').focus()};$('tabs').onclick=event=>{const id=event.target.closest('[data-ledger]')?.dataset.ledger;if(id)switchLedger(id)};$('tabs').onkeydown=event=>{const buttons=[...$('tabs').querySelectorAll('[data-ledger]')],index=buttons.indexOf(document.activeElement);if(index<0)return;let next;if(event.key==='ArrowRight')next=(index+1)%buttons.length;else if(event.key==='ArrowLeft')next=(index-1+buttons.length)%buttons.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=buttons.length-1;else return;event.preventDefault();switchLedger(buttons[next].dataset.ledger,true)};$('previous-period').onclick=()=>changePeriod(-1);$('next-period').onclick=()=>changePeriod(1);$('transactions').onclick=event=>{const id=event.target.closest('[data-edit]')?.dataset.edit;if(id)openForm(transactions.find(item=>item.id===id))};$('category').onchange=()=>renderCategoryIcon($('category').value,$('type').value);$('repeat-monthly').onchange=syncDateFields;$('landing-sign-in').onclick=signIn;$('sign-out').onclick=()=>client?.auth.signOut();
$('share-space').onclick = openShareDialog;
$('close-share').onclick = () => $('share-dialog').close();
$('create-invite').onclick = createInvite;
$('copy-invite').onclick = copyInvite;
$('share-member-list').onclick = event => {
  const memberId = event.target.closest('[data-remove-member]')?.dataset.removeMember;

  if (memberId) {
    removeMember(memberId);
  }
};
$('tab-form').onsubmit=async event=>{event.preventDefault();const name=$('tab-name').value.trim();if(!name)return;try{await createLedger(name);$('tab-dialog').close()}catch(error){alert(`Could not create this space: ${error.message}`)}};
$('form').onsubmit = async event => {
  event.preventDefault();

  const amount = parseAmount($('amount').value);

  if (!Number.isFinite(amount) || amount <= 0) {
    alert('Please enter a valid amount greater than zero.');
    return;
  }

  const submitButtons = [
    ...$('form').querySelectorAll('button[type="submit"], button:not([type])'),
  ];
  const id = $('id').value;
  const type = $('type').value;
  const repeat = $('repeat-monthly').checked;
  const saveAnother = event.submitter?.id === 'save-another';
  const existing = transactions.find(item => item.id === id);
  const transactionDate = repeat
    ? (existing ? recurringDateInPeriod(Number($('monthly-day').value), existing.date) : recurringStartDate(Number($('monthly-day').value)))
    : $('date').value;
  let recurringId = existing?.recurringTransactionId || null;
  const details = {
    ledger_id: activeLedgerId,
    type,
    amount,
    category: $('category').value,
    note: $('note').value.trim() || null,
    start_date: transactionDate,
  };

  // Prevent duplicate inserts while the database request is still in flight.
  submitButtons.forEach(button => {
    button.disabled = true;
  });

  try {
    const splittingRecurring = Boolean(repeat && existing?.recurringTransactionId);
    if (splittingRecurring) {
      await splitRecurringPayment(existing, { type, amount, category: details.category, note: details.note, date: transactionDate });
    } else if (repeat) {
      const { data, error } = await client
        .from('recurring_transactions')
        .insert({
          ...details,
          user_id: user.id,
          created_by_name: userDisplayName(),
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      recurringId = data.id;
    } else if (recurringId) {
      const { error } = await client
        .from('recurring_transactions')
        .update({ active: false })
        .eq('id', recurringId);

      if (error) {
        throw error;
      }

      const { error: futureDeleteError } = await client.from('transactions').delete().eq('ledger_id', activeLedgerId).eq('recurring_transaction_id', recurringId).gte('transaction_date', existing.date).neq('id', id);
      if (futureDeleteError) throw futureDeleteError;

      recurringId = null;
    }

    const item = {
      ledger_id: activeLedgerId,
      type,
      amount,
      category: details.category,
      transaction_date: details.start_date,
      note: details.note,
      recurring_transaction_id: recurringId,
    };
    const result = splittingRecurring
      ? { error: null }
      : id
        ? await client.from('transactions').update(item).eq('id', id)
      : await client.from('transactions').insert({
        ...item,
        user_id: user.id,
        created_by_name: userDisplayName(),
      });

    if (result.error) {
      throw result.error;
    }

    await load();

    if (saveAnother) {
      openForm(null, type);
    } else {
      $('dialog').close();
    }
  } catch (error) {
    alert(`Could not save this transaction: ${error.message}`);
  } finally {
    submitButtons.forEach(button => {
      button.disabled = false;
    });
  }
};
$('delete').onclick=async()=>{const id=$('id').value,existing=transactions.find(item=>item.id===id);if(!id)return;const message=existing?.recurringTransactionId?'Stop this monthly payment and remove it from this month onwards?':'Delete this transaction?';if(!confirm(message))return;try{if(existing?.recurringTransactionId){const{error:ruleError}=await client.from('recurring_transactions').update({active:false}).eq('id',existing.recurringTransactionId);if(ruleError)throw ruleError;const{error:occurrenceError}=await client.from('transactions').delete().eq('ledger_id',activeLedgerId).eq('recurring_transaction_id',existing.recurringTransactionId).gte('transaction_date',existing.date);if(occurrenceError)throw occurrenceError}else{const{error}=await client.from('transactions').delete().eq('id',id);if(error)throw error}$('dialog').close();await load()}catch(error){alert(`Could not delete this transaction: ${error.message}`)}};
initialize();
