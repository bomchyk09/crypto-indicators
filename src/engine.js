const IND=(()=>{
const sma=(a,n)=>a.map((_,i)=>i<n-1?NaN:a.slice(i-n+1,i+1).reduce((x,y)=>x+y,0)/n);
const ema=(a,n)=>{const k=2/(n+1);let o=[],p=NaN;a.forEach((x,i)=>{if(isNaN(x)){o.push(NaN);return}p=isNaN(p)?x:x*k+p*(1-k);o.push(p)});return o};
const rma=(a,n)=>{let o=[],p=NaN,s=0,c=0;a.forEach(x=>{if(isNaN(x)){o.push(NaN);return}if(isNaN(p)){s+=x;c++;if(c===n)p=s/n;o.push(p)}else{p=(p*(n-1)+x)/n;o.push(p)}});return o};
const std=(a,n)=>a.map((_,i)=>{if(i<n-1)return NaN;const w=a.slice(i-n+1,i+1),m=w.reduce((x,y)=>x+y,0)/n;return Math.sqrt(w.reduce((s,x)=>s+(x-m)**2,0)/n)});
const hh=(a,n)=>a.map((_,i)=>i<n-1?NaN:Math.max(...a.slice(i-n+1,i+1)));
const ll=(a,n)=>a.map((_,i)=>i<n-1?NaN:Math.min(...a.slice(i-n+1,i+1)));
function all(d){const{o,h,l,c,v}=d,N=c.length,R={};
R.sma7=sma(c,7);R.sma30=sma(c,30);R.sma50=sma(c,50);R.sma200=sma(c,200);R.ema21=ema(c,21);R.ema50=ema(c,50);
const e12=ema(c,12),e26=ema(c,26);R.macd=c.map((_,i)=>e12[i]-e26[i]);R.macdSig=ema(R.macd.map((x,i)=>i<25?NaN:x),9);R.macdHist=R.macd.map((x,i)=>x-R.macdSig[i]);
const up=c.map((x,i)=>i?Math.max(x-c[i-1],0):NaN),dn=c.map((x,i)=>i?Math.max(c[i-1]-x,0):NaN);
const rs=(n)=>{const a=rma(up,n),b=rma(dn,n);return a.map((x,i)=>b[i]===0?100:100-100/(1+x/b[i]))};R.rsi=rs(14);R.rsi7=rs(7);
const rl=ll(R.rsi.map(x=>isNaN(x)?Infinity:x),14),rh=hh(R.rsi.map(x=>isNaN(x)?-Infinity:x),14);
const st=R.rsi.map((x,i)=>(x-rl[i])/(rh[i]-rl[i])*100);R.stochRsiK=sma(st.map(x=>isFinite(x)?x:NaN),3);
const H14=hh(h,14),L14=ll(l,14);const k=c.map((x,i)=>(x-L14[i])/(H14[i]-L14[i])*100);R.stochK=sma(k,3);R.stochD=sma(R.stochK,3);R.willR=c.map((x,i)=>(H14[i]-x)/(H14[i]-L14[i])*-100);
const tp=c.map((x,i)=>(h[i]+l[i]+x)/3),tps=sma(tp,20);R.cci=tp.map((x,i)=>{if(i<19)return NaN;const w=tp.slice(i-19,i+1),md=w.reduce((s,y)=>s+Math.abs(y-tps[i]),0)/20;return(x-tps[i])/(0.015*md)});
const m20=sma(c,20),s20=std(c,20);R.bbMid=m20;R.bbUp=m20.map((x,i)=>x+2*s20[i]);R.bbLo=m20.map((x,i)=>x-2*s20[i]);R.bbPctB=c.map((x,i)=>(x-R.bbLo[i])/(R.bbUp[i]-R.bbLo[i]));R.bbWidth=m20.map((x,i)=>4*s20[i]/x*100);
const tr=c.map((x,i)=>i?Math.max(h[i]-l[i],Math.abs(h[i]-c[i-1]),Math.abs(l[i]-c[i-1])):h[i]-l[i]);R.atr=rma(tr,14);R.atrPct=R.atr.map((x,i)=>x/c[i]*100);
const e20=ema(c,20),atr10=rma(tr,10);R.kcUp=e20.map((x,i)=>x+2*atr10[i]);R.kcLo=e20.map((x,i)=>x-2*atr10[i]);R.squeeze=c.map((_,i)=>R.bbUp[i]<R.kcUp[i]&&R.bbLo[i]>R.kcLo[i]);
const pdm=h.map((x,i)=>{if(!i)return NaN;const u=x-h[i-1],dd=l[i-1]-l[i];return u>dd&&u>0?u:0}),ndm=h.map((x,i)=>{if(!i)return NaN;const u=x-h[i-1],dd=l[i-1]-l[i];return dd>u&&dd>0?dd:0});
const trs=rma(tr.map((x,i)=>i?x:NaN),14);R.diP=rma(pdm,14).map((x,i)=>100*x/trs[i]);R.diN=rma(ndm,14).map((x,i)=>100*x/trs[i]);R.adx=rma(R.diP.map((x,i)=>100*Math.abs(x-R.diN[i])/(x+R.diN[i])),14);
let sar=[],bull=true,af=.02,ep=h[0],ps=l[0];for(let i=0;i<N;i++){if(!i){sar.push(ps);continue}let s=ps+af*(ep-ps);if(bull){s=Math.min(s,l[i-1],i>1?l[i-2]:l[i-1]);if(l[i]<s){bull=false;s=ep;ep=l[i];af=.02}else if(h[i]>ep){ep=h[i];af=Math.min(af+.02,.2)}}else{s=Math.max(s,h[i-1],i>1?h[i-2]:h[i-1]);if(h[i]>s){bull=true;s=ep;ep=h[i];af=.02}else if(l[i]<ep){ep=l[i];af=Math.min(af+.02,.2)}}sar.push(s);ps=s}R.psar=sar;
const mid=(n)=>{const a=hh(h,n),b=ll(l,n);return a.map((x,i)=>(x+b[i])/2)};R.tenkan=mid(9);R.kijun=mid(26);const sa=R.tenkan.map((x,i)=>(x+R.kijun[i])/2),sb=mid(52);R.spanA=c.map((_,i)=>i>=26?sa[i-26]:NaN);R.spanB=c.map((_,i)=>i>=26?sb[i-26]:NaN);
let ob=0;R.obv=c.map((x,i)=>{if(i)ob+=x>c[i-1]?v[i]:x<c[i-1]?-v[i]:0;return ob});
const mfv=c.map((x,i)=>h[i]===l[i]?0:((x-l[i])-(h[i]-x))/(h[i]-l[i])*v[i]);R.cmf=c.map((_,i)=>i<19?NaN:mfv.slice(i-19,i+1).reduce((s,y)=>s+y,0)/v.slice(i-19,i+1).reduce((s,y)=>s+y,0));
R.force=ema(c.map((x,i)=>i?(x-c[i-1])*v[i]:NaN),13);
const rmf=tp.map((x,i)=>x*v[i]);R.mfi=c.map((_,i)=>{if(i<14)return NaN;let p=0,n=0;for(let j=i-13;j<=i;j++){if(tp[j]>tp[j-1])p+=rmf[j];else if(tp[j]<tp[j-1])n+=rmf[j]}return n?100-100/(1+p/n):100});
R.vwap20=c.map((_,i)=>i<19?NaN:tp.slice(i-19,i+1).reduce((s,y,j)=>s+y*v[i-19+j],0)/v.slice(i-19,i+1).reduce((s,y)=>s+y,0));
const vs20=sma(v,20);R.volRatio=v.map((x,i)=>x/vs20[i]);
const at=rma(tr,10);let fu=[],fl=[],dir=[];for(let i=0;i<N;i++){const m=(h[i]+l[i])/2,bu=m+3*at[i],bl=m-3*at[i];if(isNaN(at[i])){fu.push(NaN);fl.push(NaN);dir.push(1);continue}const pu=isNaN(fu[i-1])?bu:fu[i-1],pl=isNaN(fl[i-1])?bl:fl[i-1];const U=(bu<pu||c[i-1]>pu)?bu:pu,L=(bl>pl||c[i-1]<pl)?bl:pl;let d=dir[i-1]||1;if(d===1&&c[i]<L)d=-1;else if(d===-1&&c[i]>U)d=1;fu.push(U);fl.push(L);dir.push(d)}R.stDir=dir;R.supertrend=dir.map((d,i)=>d===1?fl[i]:fu[i]);
R.donHi=hh(h,20);R.donLo=ll(l,20);
// --- Нові (2026-11-24): часовий імпульс, Z-score, показник Херста ---
const ret=(k)=>c.map((x,i)=>i<k?NaN:x/c[i-k]-1);
const r7=ret(7),r28=ret(28),r84=ret(84);
R.tsmom=c.map((_,i)=>isNaN(r84[i])?NaN:Math.sign(r7[i])+Math.sign(r28[i])+Math.sign(r84[i])); // -3..+3
R.z20=c.map((x,i)=>(x-m20[i])/s20[i]);
const lrH=c.map((x,i)=>i?Math.log(x/c[i-1]):NaN);
const rs_=(a)=>{const m=a.reduce((s,y)=>s+y,0)/a.length;let cum=0,mx=-Infinity,mn=Infinity,ss=0;for(const y of a){cum+=y-m;mx=Math.max(mx,cum);mn=Math.min(mn,cum);ss+=(y-m)**2}const sd=Math.sqrt(ss/a.length);return sd>0?(mx-mn)/sd:NaN};
const HW=128,SZ=[8,16,32,64,128];
R.hurst=c.map((_,i)=>{if(i<HW)return NaN;const w=lrH.slice(i-HW+1,i+1);const xs=[],ys=[];for(const n of SZ){const k=HW/n;let s=0,cnt=0;for(let j=0;j<k;j++){const v_=rs_(w.slice(j*n,(j+1)*n));if(isFinite(v_)&&v_>0){s+=v_;cnt++}}if(cnt){xs.push(Math.log(n));ys.push(Math.log(s/cnt))}}if(xs.length<3)return NaN;const mx=xs.reduce((a,b)=>a+b)/xs.length,my=ys.reduce((a,b)=>a+b)/ys.length;let nu=0,de=0;xs.forEach((x,j)=>{nu+=(x-mx)*(ys[j]-my);de+=(x-mx)**2});return nu/de});
R.roc=c.map((x,i)=>i<14?NaN:(x/c[i-14]-1)*100);R.mayer=c.map((x,i)=>x/R.sma200[i]);
const lr=c.map((x,i)=>i?Math.log(x/c[i-1]):NaN);R.rvol=std(lr,30).map(x=>x*Math.sqrt(365)*100);
const W=90,s0=N-W,hi=Math.max(...h.slice(s0)),lo=Math.min(...l.slice(s0));R.fib={hi,lo,f382:hi-(hi-lo)*.382,f5:hi-(hi-lo)*.5,f618:hi-(hi-lo)*.618};
const P=(h[N-2]+l[N-2]+c[N-2])/3;R.pivot={P,R1:2*P-l[N-2],S1:2*P-h[N-2],R2:P+(h[N-2]-l[N-2]),S2:P-(h[N-2]-l[N-2])};
const bins=40,pmin=Math.min(...l.slice(s0)),pmax=Math.max(...h.slice(s0)),bw=(pmax-pmin)/bins,vp=Array(bins).fill(0);for(let i=s0;i<N;i++){const b=Math.min(bins-1,Math.floor((tp[i]-pmin)/bw));vp[b]+=v[i]}const pb=vp.indexOf(Math.max(...vp));R.vp={bins:vp,pmin,bw,poc:pmin+bw*(pb+.5)};
const win=30,lowIdx=(a,from,to)=>{let m=from;for(let i=from;i<=to;i++)if(a[i]<a[m])m=i;return m};const a1=lowIdx(l,N-win,N-1),a0=lowIdx(l,N-2*win,N-win-1);R.div=(l[a1]<l[a0]&&R.rsi[a1]>R.rsi[a0])?"бичача":((()=>{const hi1=h.slice(N-win).indexOf(Math.max(...h.slice(N-win)))+N-win,hi0=h.slice(N-2*win,N-win).indexOf(Math.max(...h.slice(N-2*win,N-win)))+N-2*win;return h[hi1]>h[hi0]&&R.rsi[hi1]<R.rsi[hi0]?"ведмежа":"немає"})());
// --- Зведена оцінка (2026-11-24): 6 незалежних складових, кожна −1/0/+1, сума −6…+6.
// Тренд: ціна vs SMA200; Supertrend. Імпульс: бал TSMOM (≥2 / ≤−2); RSI у «трендовому» прочитанні (>55 / <45 — за бектестом
// RSI>70 означає силу, а не розворот). Положення в 20-денному каналі (верхні/нижні 20 %). Обсяг: CMF (±0,05).
R.comp=c.map((x,i)=>{if(!isFinite(R.sma200[i])||!isFinite(R.tsmom[i])||!isFinite(R.cmf[i]))return NaN;
 const ch=(x-R.donLo[i])/(R.donHi[i]-R.donLo[i]);
 return Math.sign(x-R.sma200[i])+(R.stDir[i]>0?1:-1)+(R.tsmom[i]>=2?1:R.tsmom[i]<=-2?-1:0)+(R.rsi[i]>55?1:R.rsi[i]<45?-1:0)+(ch>0.8?1:ch<0.2?-1:0)+(R.cmf[i]>0.05?1:R.cmf[i]<-0.05?-1:0)});
R.compState=R.comp.map(s=>!isFinite(s)?"—":s>=4?"бичачий":s<=-4?"ведмежий":"нейтральний");
return R}
return{all}})();
module.exports=IND;
