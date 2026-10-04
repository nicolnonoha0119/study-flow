import React,{useEffect,useMemo,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Home,Brain,ChartNoAxesCombined,Trophy,Target,Play,Square,Send,Plus,Minus,Clock3,Flame,CalendarDays,ChevronRight,CheckCircle2} from 'lucide-react';
import './styles.css';

const initialSubjects=[
 {name:'数学',icon:'➗',planned:18*60,actual:16*60+20,color:'purple'},
 {name:'英語',icon:'🇬🇧',planned:7*60,actual:6*60+10,color:'blue'},
 {name:'化学',icon:'🧪',planned:4*60,actual:4*60+2,color:'green'},
 {name:'物理',icon:'⚛️',planned:5*60,actual:5*60+10,color:'orange'},
 {name:'研究',icon:'🎸',planned:3*60,actual:3*60,color:'pink'}
];
const initialSchedule=[
 ['09:10','10:40','数学','基礎問題精講 数III 積分','残り8例題を進める'],
 ['10:40','10:55','休憩','休憩',''],
 ['10:55','11:55','英語','Vintage','20問'],
 ['11:55','12:55','休憩','昼休憩',''],
 ['12:55','14:00','化学','セミナー 第1章','基礎問題'],
 ['14:15','15:25','物理','セミナー 第1章',''],
 ['15:40','16:25','研究','ギター音色AI','']
];
function fmt(m){return `${Math.floor(m/60)}時間${m%60}分`}
function App(){
 const [page,setPage]=useState('today');
 const [subjects,setSubjects]=useState(()=>JSON.parse(localStorage.getItem('sf_subjects')||'null')||initialSubjects);
 const [schedule,setSchedule]=useState(initialSchedule);
 const [condition,setCondition]=useState(localStorage.getItem('sf_condition')||'普通');
 const [comment,setComment]=useState(localStorage.getItem('sf_comment')||'');
 const [timer,setTimer]=useState({running:false,seconds:0,subject:'数学'});
 const [logs,setLogs]=useState(()=>JSON.parse(localStorage.getItem('sf_logs')||'[]'));
 const [chat,setChat]=useState([{role:'ai',text:'こんにちは。今日の勉強、計画変更、疲労度、時間配分など何でも相談できます。'}]);
 const [input,setInput]=useState('');
 const [xp,setXp]=useState(Number(localStorage.getItem('sf_xp')||1240));
 useEffect(()=>{localStorage.setItem('sf_subjects',JSON.stringify(subjects))},[subjects]);
 useEffect(()=>{localStorage.setItem('sf_condition',condition);localStorage.setItem('sf_comment',comment)},[condition,comment]);
 useEffect(()=>{localStorage.setItem('sf_logs',JSON.stringify(logs))},[logs]);
 useEffect(()=>{localStorage.setItem('sf_xp',xp)},[xp]);
 useEffect(()=>{if(!timer.running)return;const id=setInterval(()=>setTimer(t=>({...t,seconds:t.seconds+1})),1000);return()=>clearInterval(id)},[timer.running]);
 const todayMinutes=subjects.reduce((a,s)=>a+s.actual,0)-subjects.find(s=>s.name==='研究').actual+204; // visual demo value
 const weekly=1662;
 const totalPlanned=subjects.reduce((a,s)=>a+s.planned,0),totalActual=subjects.reduce((a,s)=>a+s.actual,0);
 function startTimer(){setTimer(t=>({...t,running:true}))}
 function stopTimer(){if(timer.seconds<30){setTimer(t=>({...t,running:false,seconds:0}));return} const mins=Math.max(1,Math.round(timer.seconds/60));setLogs(l=>[...l,{date:new Date().toISOString(),subject:timer.subject,minutes:mins}]);setSubjects(ss=>ss.map(s=>s.name===timer.subject?{...s,actual:s.actual+mins}:s));setXp(x=>x+mins);setTimer({running:false,seconds:0,subject:timer.subject})}
 function chatSend(){if(!input.trim())return;const q=input.trim();setChat(c=>[...c,{role:'user',text:q}]);setInput('');setTimeout(()=>{let a='過去7日間の実績をもとに、今後の時間見積もりを更新します。';if(q.includes('数学'))a='数学は最近1題あたり平均21分。今後の数学タスクは余裕を持って再計算します。';if(q.includes('6時間'))a='明日は6時間確保できる前提で、遅れている科目を優先して時間割を再計算します。';if(q.includes('疲れ')||q.includes('疲労'))a='今日は負荷を下げ、重い新規問題を減らして復習中心に変更するのがおすすめです。';setChat(c=>[...c,{role:'ai',text:a}])},500)}
 function regenerate(){const shift=condition==='かなり疲れた'? -20:condition==='少し疲れた'?-10:condition==='絶好調'?10:0;setSchedule(s=>s.map((x,i)=>i===0?[x[0],x[1],x[2],x[3],`${x[4]}（AI調整済み）`]:x));setChat(c=>[...c,{role:'ai',text:`コンディション「${condition}」を反映しました。今日の負荷を${shift<0?Math.abs(shift)+'分減らす':shift>0?shift+'分増やす':'維持する'}方向で再計画します。`}])}
 const nav=[['today','TODAY',Home],['ai','AI',Brain],['progress','PROGRESS',ChartNoAxesCombined],['level','LEVEL',Trophy],['roadmap','ROADMAP',Target]];
 return <div className="app"><aside className="sidebar"><div className="logo">Study<span>Flow</span></div><nav>{nav.map(([id,label,Icon])=><button key={id} className={page===id?'active':''} onClick={()=>setPage(id)}><Icon size={18}/>{label}</button>)}</nav><div className="profile">📚 StudyFlow<br/><small>受験学習をAIで最適化</small></div></aside><main className="main">
 {page==='today'&&<Today schedule={schedule} condition={condition} setCondition={setCondition} comment={comment} setComment={setComment} regenerate={regenerate} timer={timer} setTimer={setTimer} startTimer={startTimer} stopTimer={stopTimer} todayMinutes={todayMinutes} />}
 {page==='ai'&&<AI chat={chat} input={input} setInput={setInput} send={chatSend} />}
 {page==='progress'&&<Progress subjects={subjects} totalPlanned={totalPlanned} totalActual={totalActual} logs={logs}/>} 
 {page==='level'&&<Level xp={xp} logs={logs}/>} 
 {page==='roadmap'&&<Roadmap subjects={subjects}/>} 
 </main></div>
}
function Header({title,sub}){return <div className="top"><div><h1>{title}</h1><p>{sub}</p></div><div className="date"><CalendarDays size={16}/> 10月5日（月）</div></div>}
function Today(p){return <><Header title="今日の学習" sub="あなたの実績とコンディションから、今日の計画を最適化します。"/><div className="stats"><Stat label="今日の目標" value="5時間30分" c="purple"/><Stat label="今日の実績" value="3時間24分" c="green"/><Stat label="進捗" value="62%" c="orange"/><Stat label="連続勉強" value="🔥 6日" c="blue"/></div><div className="grid"><section className="card"><div className="section-title">今日のスケジュール</div>{p.schedule.map((x,i)=><div className={'task '+(x[2]==='休憩'?'break':'')} key={i}><span className="time">{x[0]}–{x[1]}</span><div><b>{x[3]}</b><small>{x[4]}</small></div><span className="tag">{x[2]}</span></div>)}</section><div><section className="card ai-card"><div className="section-title">🧠 AIからの提案</div><p>最近の数学は<strong>1題あたり平均21分</strong>。従来の15分見積もりより時間が必要です。</p><p>また、コンディションを反映して計画を調整できます。</p><button className="primary" onClick={p.regenerate}>今日の計画を再計算</button></section><section className="card condition"><div className="section-title">🌡 今日のコンディション</div><div className="conditions">{['絶好調','普通','少し疲れた','かなり疲れた'].map(x=><button className={p.condition===x?'selected':''} onClick={()=>p.setCondition(x)} key={x}>{x}</button>)}</div><textarea value={p.comment} onChange={e=>p.setComment(e.target.value)} placeholder="例：今日は数学は頭が回らない"/><small>AIはこの情報を今日の計画調整に使います。</small></section></div></div><section className="card timer"><div><div className="section-title">⏱ 勉強タイマー</div><select value={p.timer.subject} onChange={e=>p.setTimer(t=>({...t,subject:e.target.value}))}>{['数学','英語','化学','物理','研究'].map(x=><option key={x}>{x}</option>)}</select><div className="clock">{String(Math.floor(p.timer.seconds/3600)).padStart(2,'0')}:{String(Math.floor(p.timer.seconds/60)%60).padStart(2,'0')}:{String(p.timer.seconds%60).padStart(2,'0')}</div>{!p.timer.running?<button className="primary" onClick={p.startTimer}><Play size={16}/> 勉強開始</button>:<button className="danger" onClick={p.stopTimer}><Square size={16}/> 終了して実績に追加</button>}</div><div className="timer-note">終了すると、科目別の実績時間に自動加算され、次回以降の時間見積もりに利用されます。</div></section></>}
function Stat({label,value,c}){return <div className="card stat"><small>{label}</small><strong className={c}>{value}</strong></div>}
function AI({chat,input,setInput,send}){return <><Header title="AI Coach" sub="自然な会話で、計画・進捗・勉強方法を調整"/><section className="card"><div className="chat">{chat.map((m,i)=><div key={i} className={'bubble '+m.role}>{m.text}</div>)}</div><div className="chat-input"><input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&send()} placeholder="例：明日は6時間できます"/><button className="primary" onClick={send}><Send size={16}/>送信</button></div></section></>}
function Progress({subjects,totalPlanned,totalActual,logs}){return <><Header title="PROGRESS" sub="予定と実績を比較し、あなたの勉強ペースを学習します。"/><div className="stats"><Stat label="今週" value="27時間42分" c="purple"/><Stat label="今日" value="3時間24分" c="green"/><Stat label="記録数" value={`${logs.length}件`} c="blue"/><Stat label="平均ペース" value="学習中" c="orange"/></div><section className="card"><div className="section-title">科目別：予定 vs 実績</div>{subjects.map(s=><div className="subject" key={s.name}><div className="row"><span>{s.icon} {s.name}</span><b>{fmt(s.actual)} / {fmt(s.planned)}</b></div><div className="bar"><i style={{width:`${Math.min(100,s.actual/s.planned*100)}%`}}/></div></div>)}</section></>}
function Level({xp,logs}){const lv=Math.max(1,Math.floor(xp/100));return <><Header title="LEVEL" sub="無理な勉強量ではなく、計画達成と継続を評価します。"/><section className="card level-card"><div className="level-circle">{lv}</div><div><h2>StudyFlow Lv.{lv}</h2><p>⭐ {xp.toLocaleString()} XP　｜　🔥 6日連続</p></div></section><section className="card"><div className="section-title">🏆 バッジ</div><span className="badge">数学100題</span><span className="badge">Vintage500問</span><span className="badge">7日連続</span><span className="badge">週間30時間</span><span className="badge">計画達成率90%</span></section></>}
function Roadmap({subjects}){return <><Header title="ROADMAP" sub="受験日から逆算し、長期目標を今日のタスクへ落とし込みます。"/><section className="card"><h2>第一志望：私立理系</h2><p className="muted">入試までの残り日数を基準に、各教材・科目の締切を自動調整します。</p><div className="road"><div className="step done">基礎完成<br/>✓</div><div className="step current">標準問題<br/>NOW</div><div className="step">応用問題</div><div className="step">過去問</div><div className="step">直前演習</div></div></section><section className="card"><div className="section-title">教材の現在地</div><p>➗ 数学：基礎問題精講 数III 積分 — 残り約30例題から進行中</p><p>🇬🇧 英語：Vintage — 205 / 1596</p><p>⚛️ 物理：セミナー — 1 / 25章</p><p>🧪 化学：セミナー — 0 / 27章</p><small className="muted">※このプレビューでは入力例として表示しています。実運用では教材管理画面から編集します。</small></section></>}
createRoot(document.getElementById('root')).render(<App/>);
