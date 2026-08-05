'use strict';

const AVATAR_CLIENT_TARGET_SIZE = 256;
const AVATAR_CLIENT_MAX_SOURCE_BYTES = 8 * 1024 * 1024;
const AVATAR_CLIENT_MAX_UPLOAD_BYTES = 512 * 1024;
const avatarObjectUrlCache = new Map();
const avatarObjectUrlPromises = new Map();

function avatarInfoForUser(user){
  const profile = user && user.profile && typeof user.profile === 'object' ? user.profile : {};
  return {
    id:String(user && user.id || '').trim(),
    username:String(user && user.username || 'Mitglied').trim() || 'Mitglied',
    hasAvatar:!!(user && user.hasAvatar !== undefined ? user.hasAvatar : profile.hasAvatar),
    updatedAt:String((user && user.avatarUpdatedAt) || profile.avatarUpdatedAt || '')
  };
}
function avatarCacheKeyForUser(user){
  const info = avatarInfoForUser(user);
  return info.id ? info.id + '|' + (info.updatedAt || 'avatar') : '';
}
function avatarInitial(username){
  const value = String(username || '').trim();
  return value ? value.charAt(0).toLocaleUpperCase('de-DE') : '?';
}
function avatarChildren(element){
  if(!element) return {image:null, fallback:null};
  return {
    image:element.querySelector('.profile-avatar-image'),
    fallback:element.querySelector('.profile-avatar-fallback')
  };
}
function resetAvatarElement(element, username){
  const parts = avatarChildren(element);
  if(parts.fallback){ parts.fallback.textContent = avatarInitial(username); parts.fallback.hidden = false; }
  if(parts.image){ parts.image.hidden = true; parts.image.removeAttribute('src'); parts.image.alt = ''; }
  if(element) element.dataset.avatarRequestKey = '';
}
function invalidateAvatarCacheForUser(userId){
  const prefix = String(userId || '').trim() + '|';
  if(!prefix || prefix === '|') return;
  for(const [key, url] of avatarObjectUrlCache.entries()){
    if(!key.startsWith(prefix)) continue;
    try{ URL.revokeObjectURL(url); }catch(_){}
    avatarObjectUrlCache.delete(key);
  }
  for(const key of Array.from(avatarObjectUrlPromises.keys())){
    if(key.startsWith(prefix)) avatarObjectUrlPromises.delete(key);
  }
}
function clearAvatarObjectUrlCache(){
  for(const url of avatarObjectUrlCache.values()){
    try{ URL.revokeObjectURL(url); }catch(_){}
  }
  avatarObjectUrlCache.clear();
  avatarObjectUrlPromises.clear();
}
async function memberAvatarObjectUrl(user){
  const info = avatarInfoForUser(user);
  const key = avatarCacheKeyForUser(user);
  if(!info.id || !info.hasAvatar || !key || !onlineAuthToken) return '';
  if(avatarObjectUrlCache.has(key)) return avatarObjectUrlCache.get(key);
  if(avatarObjectUrlPromises.has(key)) return avatarObjectUrlPromises.get(key);
  const promise = (async()=>{
    const response = await fetch(onlineApiBaseUrl() + '/api/members/' + encodeURIComponent(info.id) + '/avatar', {
      method:'GET',
      headers:{authorization:'Bearer ' + onlineAuthToken},
      cache:'default'
    });
    if(!response.ok) return '';
    const blob = await response.blob();
    if(!blob || !/^image\/(jpeg|png|webp)$/i.test(String(blob.type || ''))) return '';
    const objectUrl = URL.createObjectURL(blob);
    avatarObjectUrlCache.set(key, objectUrl);
    return objectUrl;
  })().catch(()=> '').finally(()=> avatarObjectUrlPromises.delete(key));
  avatarObjectUrlPromises.set(key, promise);
  return promise;
}
function applyAvatarToElement(element, user){
  if(!element) return;
  const info = avatarInfoForUser(user);
  resetAvatarElement(element, info.username);
  element.setAttribute('aria-label', info.hasAvatar ? ('Profilbild von ' + info.username) : ('Buchstaben-Avatar von ' + info.username));
  if(!info.hasAvatar || !info.id) return;
  const requestKey = avatarCacheKeyForUser(user);
  element.dataset.avatarRequestKey = requestKey;
  memberAvatarObjectUrl(user).then(objectUrl=>{
    if(!objectUrl || element.dataset.avatarRequestKey !== requestKey) return;
    const parts = avatarChildren(element);
    if(parts.image){ parts.image.src = objectUrl; parts.image.alt = 'Profilbild von ' + info.username; parts.image.hidden = false; }
    if(parts.fallback) parts.fallback.hidden = true;
  }).catch(()=>{});
}
function createMemberAvatarElement(user, sizeClass){
  const avatar = document.createElement('div');
  avatar.className = 'profile-avatar ' + (sizeClass || 'profile-avatar-small');
  const fallback = document.createElement('span');
  fallback.className = 'profile-avatar-fallback';
  const image = document.createElement('img');
  image.className = 'profile-avatar-image';
  image.alt = '';
  image.hidden = true;
  avatar.appendChild(fallback);
  avatar.appendChild(image);
  applyAvatarToElement(avatar, user || {});
  return avatar;
}
function formatAvatarFileSize(bytes){
  const value = Number(bytes || 0);
  if(!Number.isFinite(value) || value <= 0) return '0 KB';
  if(value < 1024 * 1024) return Math.max(1, Math.round(value / 1024)) + ' KB';
  return (value / (1024 * 1024)).toFixed(1).replace('.', ',') + ' MB';
}
function canvasToBlob(canvas, type, quality){
  return new Promise((resolve, reject)=>{
    try{
      canvas.toBlob(blob=> blob ? resolve(blob) : reject(new Error('Das Profilbild konnte nicht verarbeitet werden.')), type, quality);
    }catch(err){ reject(err); }
  });
}
async function loadAvatarImageSource(file){
  if('createImageBitmap' in window){
    try{
      const bitmap = await createImageBitmap(file, {imageOrientation:'from-image'});
      return {source:bitmap, width:bitmap.width, height:bitmap.height, cleanup:()=>{ try{ bitmap.close(); }catch(_){} }};
    }catch(_){ }
  }
  const objectUrl = URL.createObjectURL(file);
  try{
    const image = await new Promise((resolve, reject)=>{
      const img = new Image();
      img.onload = ()=>resolve(img);
      img.onerror = ()=>reject(new Error('Die ausgewählte Bilddatei konnte nicht geöffnet werden.'));
      img.src = objectUrl;
    });
    return {source:image, width:image.naturalWidth, height:image.naturalHeight, cleanup:()=>URL.revokeObjectURL(objectUrl)};
  }catch(err){
    URL.revokeObjectURL(objectUrl);
    throw err;
  }
}
async function prepareAvatarBlob(file){
  if(!file) throw new Error('Bitte ein Profilbild auswählen.');
  if(!/^image\/(jpeg|png|webp)$/i.test(String(file.type || ''))) throw new Error('Erlaubt sind JPG-, PNG- und WebP-Bilder.');
  if(Number(file.size || 0) > AVATAR_CLIENT_MAX_SOURCE_BYTES) throw new Error('Die ausgewählte Originaldatei darf höchstens 8 MB groß sein.');
  const loaded = await loadAvatarImageSource(file);
  try{
    const width = Number(loaded.width || 0), height = Number(loaded.height || 0);
    if(!width || !height) throw new Error('Das Bild besitzt keine gültigen Abmessungen.');
    const side = Math.min(width, height);
    const sourceX = Math.max(0, (width - side) / 2);
    const sourceY = Math.max(0, (height - side) / 2);
    const canvas = document.createElement('canvas');
    canvas.width = AVATAR_CLIENT_TARGET_SIZE;
    canvas.height = AVATAR_CLIENT_TARGET_SIZE;
    const context = canvas.getContext('2d', {alpha:true});
    if(!context) throw new Error('Die Bildverarbeitung wird von diesem Browser nicht unterstützt.');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(loaded.source, sourceX, sourceY, side, side, 0, 0, AVATAR_CLIENT_TARGET_SIZE, AVATAR_CLIENT_TARGET_SIZE);
    let blob = await canvasToBlob(canvas, 'image/webp', 0.84).catch(()=>null);
    if(!blob || !/^image\/(webp|png|jpeg)$/i.test(String(blob.type || '')) || blob.size > AVATAR_CLIENT_MAX_UPLOAD_BYTES){
      const jpegCanvas = document.createElement('canvas');
      jpegCanvas.width = AVATAR_CLIENT_TARGET_SIZE;
      jpegCanvas.height = AVATAR_CLIENT_TARGET_SIZE;
      const jpegContext = jpegCanvas.getContext('2d', {alpha:false});
      if(!jpegContext) throw new Error('Die Bildverarbeitung wird von diesem Browser nicht unterstützt.');
      jpegContext.fillStyle = '#ffffff';
      jpegContext.fillRect(0, 0, AVATAR_CLIENT_TARGET_SIZE, AVATAR_CLIENT_TARGET_SIZE);
      jpegContext.drawImage(canvas, 0, 0);
      blob = await canvasToBlob(jpegCanvas, 'image/jpeg', 0.86);
    }
    if(!blob || blob.size > AVATAR_CLIENT_MAX_UPLOAD_BYTES) throw new Error('Das verkleinerte Profilbild ist noch zu groß. Bitte ein anderes Bild wählen.');
    return blob;
  } finally {
    try{ loaded.cleanup(); }catch(_){}
  }
}
async function uploadAccountAvatar(blob){
  const form = new FormData();
  const extension = blob.type === 'image/png' ? 'png' : blob.type === 'image/jpeg' ? 'jpg' : 'webp';
  form.append('avatar', blob, 'avatar.' + extension);
  const headers = {};
  if(onlineAuthToken) headers.authorization = 'Bearer ' + onlineAuthToken;
  const response = await fetch(onlineApiBaseUrl() + '/api/account/avatar', {method:'POST', headers, body:form});
  let data = null;
  try{ data = await response.json(); }catch(_){ data = {ok:false, message:'Antwort konnte nicht gelesen werden.'}; }
  if(!response.ok || !data.ok){ const err = new Error(data.message || 'Profilbild konnte nicht gespeichert werden.'); err.data = data; throw err; }
  return data;
}
