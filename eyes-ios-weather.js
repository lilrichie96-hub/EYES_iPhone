/* Weather Organ on iPhone: real Open-Meteo measurements and browser geolocation. */
'use strict';
(function(){
const SAVE='eyes.ios.weather.place.v1';
const WEATHER={0:['☀','Clear sky'],1:['🌤','Mostly clear'],2:['⛅','Partly cloudy'],3:['☁','Cloudy'],45:['🌫','Fog'],48:['🌫','Fog'],51:['🌦','Drizzle'],53:['🌧','Drizzle'],55:['🌧','Drizzle'],61:['🌧','Rain'],63:['🌧','Rain'],65:['🌧','Heavy rain'],71:['❄','Snow'],73:['❄','Snow'],75:['❄','Heavy snow'],80:['🌦','Showers'],81:['🌧','Showers'],82:['🌧','Heavy showers'],95:['⛈','Thunderstorms'],96:['⛈','Thunderstorms'],99:['⛈','Thunderstorms']};
const decode=c=>WEATHER[c]||[c>=70&&c<80?'❄':'☁','Changing skies'];
let last=null;
function open({body,notice,esc}){
 let controller=new AbortController(), live=true;
 body.innerHTML='<div class="ea-space"><div class="ea-weather-symbol" id="ew-symbol">✧</div><div class="ea-weather-temp" id="ew-temp">—</div><div class="ea-weather-info" id="ew-desc">Your Eye is looking up.</div></div><h2>Weather Organ</h2><p>Give your Eye a sky to keep inside its iris. Weather comes from Open-Meteo, with no invented readings.</p><div class="ea-actions"><button id="ew-here">Use my location</button><button id="ew-refresh">Refresh</button></div><form class="ea-row" id="ew-find"><input id="ew-city" required placeholder="City or town" aria-label="City or town"><button type="submit">Find</button></form><div id="ew-forecast" aria-live="polite"></div><p class="ea-mini">Location is requested only when you tap the button. Weather requires internet access; a cached last reading is labeled when shown.</p>';
 const el=id=>body.querySelector('#'+id);
 let chosen=null;try{chosen=JSON.parse(localStorage.getItem(SAVE)||'null')}catch(_){}
 function render(d,where,cached){
  if(!live)return;
  const c=d.current,code=Number(c.weather_code),desc=decode(code),fahr=d.current_units.temperature_2m.includes('°F');
  el('ew-symbol').textContent=desc[0];el('ew-temp').textContent=Math.round(c.temperature_2m)+'°';
  el('ew-desc').textContent=where+' · '+desc[1]+' · feels like '+Math.round(c.apparent_temperature)+'°'+(cached?' · cached':'');
  const root=el('ew-forecast');root.replaceChildren();
  const h=document.createElement('h3');h.textContent='Coming hours';root.appendChild(h);
  const hours=d.hourly?.time||[],temps=d.hourly?.temperature_2m||[],codes=d.hourly?.weather_code||[];
  let start=hours.findIndex(t=>t>=(c.time||''));if(start<0)start=0;
  const strip=document.createElement('div');strip.className='ea-row';
  for(let i=start;i<Math.min(start+5,hours.length);i++){
   const b=document.createElement('div');b.className='ea-card';b.style.flex='1';b.style.minWidth='75px';
   const date=new Date(hours[i]);const title=document.createElement('div');title.className='ea-mini';title.textContent=(Number.isFinite(date.getTime())?date.toLocaleTimeString([],{hour:'numeric'}):hours[i].slice(11));
   const val=document.createElement('div');val.textContent=decode(codes[i])[0]+' '+Math.round(temps[i])+'°';val.style.fontSize='17px';
   b.append(title,val);strip.appendChild(b);
  }
  root.append(strip);
  const stamp=document.createElement('p');stamp.className='ea-mini';stamp.textContent='Observed: '+c.time.replace('T',' ')+' local time · Open-Meteo';root.appendChild(stamp);
 }
 async function forecast(place){
  controller.abort();controller=new AbortController();
  const url=new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude',place.latitude);url.searchParams.set('longitude',place.longitude);
  url.searchParams.set('current','temperature_2m,apparent_temperature,weather_code,is_day,relative_humidity_2m,wind_speed_10m');
  url.searchParams.set('hourly','temperature_2m,weather_code');
  url.searchParams.set('forecast_days','2');url.searchParams.set('timezone','auto');
  url.searchParams.set('temperature_unit','fahrenheit');url.searchParams.set('wind_speed_unit','mph');
  notice('Your Eye is reading the sky…');
  try{
   const res=await fetch(url,{signal:controller.signal});if(!res.ok)throw Error('Weather service unavailable');
   const data=await res.json();if(!data.current?.time)throw Error('No current weather available');
   last={data,where:place.name,at:Date.now()};render(data,place.name,false);notice('');
  }catch(err){if(err.name==='AbortError')return;if(last){render(last.data,last.where,true);notice('Showing cached weather. '+err.message)}else notice('Could not load weather. Check your connection and retry.')}
 }
 el('ew-here').onclick=()=>{
  if(!navigator.geolocation){notice('Location is unavailable in this browser. Enter a city instead.');return}
  notice('Requesting location permission…');
  navigator.geolocation.getCurrentPosition(p=>{
   chosen={latitude:p.coords.latitude,longitude:p.coords.longitude,name:'Your location'};forecast(chosen);
  },e=>notice('Location unavailable. Enter a city instead.'),{timeout:12000,maximumAge:300000,enableHighAccuracy:false});
 };
 el('ew-refresh').onclick=()=>{if(chosen)forecast(chosen);else notice('Choose a city or your location first.')};
 el('ew-find').onsubmit=async e=>{
  e.preventDefault();const query=el('ew-city').value.trim();if(!query)return;
  notice('Finding '+query+'…');
  try{const u='https://geocoding-api.open-meteo.com/v1/search?name='+encodeURIComponent(query)+'&count=1&language=en&format=json';
   const res=await fetch(u);if(!res.ok)throw Error('Place lookup failed');
   const j=await res.json();const p=j.results?.[0];if(!p)throw Error('No matching city found');
   chosen={latitude:p.latitude,longitude:p.longitude,name:[p.name,p.admin1,p.country].filter(Boolean).join(', ')};
   localStorage.setItem(SAVE,JSON.stringify(chosen));forecast(chosen)
  }catch(err){notice(err.message||'Could not find this city')}
 };
 if(chosen)forecast(chosen);
 return ()=>{live=false;controller.abort()};
}
window.EyesIOSAbilities.register({id:'weather',label:'Weather Organ',icon:'☁',open});
})();