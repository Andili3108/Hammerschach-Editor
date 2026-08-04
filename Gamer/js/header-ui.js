'use strict';

function updateSiteFootnotePlacement(){
  if(!siteFootnoteEl||!siteFootnoteHome)return;
  if(analyzerToolActive&&analyzerToolView){
    if(siteFootnoteEl.parentNode!==analyzerToolView)analyzerToolView.appendChild(siteFootnoteEl);
    return;
  }
  if(trainerToolActive&&trainerToolView){
    if(siteFootnoteEl.parentNode!==trainerToolView)trainerToolView.appendChild(siteFootnoteEl);
    return;
  }
  if(openingsToolActive&&openingsToolView){
    if(siteFootnoteEl.parentNode!==openingsToolView)openingsToolView.appendChild(siteFootnoteEl);
    return;
  }
  if(fairplayToolActive&&fairplayToolView){
    if(siteFootnoteEl.parentNode!==fairplayToolView)fairplayToolView.appendChild(siteFootnoteEl);
    return;
  }
  if(tvToolActive&&tvToolView){
    if(siteFootnoteEl.parentNode!==tvToolView)tvToolView.appendChild(siteFootnoteEl);
    return;
  }
  if(isMemberLobbyView()&&memberLobbyEl){
    if(siteFootnoteEl.parentNode!==memberLobbyEl)memberLobbyEl.appendChild(siteFootnoteEl);
    return;
  }
  if(siteFootnoteEl.parentNode!==siteFootnoteHome.parent){
    if(siteFootnoteHome.nextSibling&&siteFootnoteHome.nextSibling.parentNode===siteFootnoteHome.parent)siteFootnoteHome.parent.insertBefore(siteFootnoteEl,siteFootnoteHome.nextSibling);else siteFootnoteHome.parent.appendChild(siteFootnoteEl);
  }
}

const headerMenuControllers = [];
function registerHeaderMenu(menuEl, menuBtn, menuPopup, title){
  if(!menuEl || !menuBtn || !menuPopup) return null;
  const label = String(title || 'Menü');
  const controller = {
    menuEl,
    menuBtn,
    menuPopup,
    setOpen(open, focusFirst){
      const shouldOpen = !!open;
      if(shouldOpen){
        headerMenuControllers.forEach(other => {
          if(other !== controller) other.setOpen(false, false);
        });
      }
      menuEl.classList.toggle('open', shouldOpen);
      menuPopup.hidden = !shouldOpen;
      menuBtn.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
      menuBtn.title = shouldOpen ? label + ' schließen' : label + ' öffnen';
      if(shouldOpen && focusFirst){
        const firstItem = Array.from(menuPopup.querySelectorAll('[role="menuitem"]')).find(item => !item.hidden && !item.disabled);
        if(firstItem) firstItem.focus();
      }
      hammerschachScheduleHeightReport(false);
    },
    close(){ this.setOpen(false, false); }
  };
  headerMenuControllers.push(controller);
  menuBtn.title = label + ' öffnen';
  menuBtn.addEventListener('click', event => {
    event.stopPropagation();
    controller.setOpen(menuPopup.hidden, false);
  });
  menuBtn.addEventListener('keydown', event => {
    if(event.key === 'ArrowDown'){
      event.preventDefault();
      controller.setOpen(true, true);
    }
  });
  menuPopup.addEventListener('click', event => {
    if(event.target.closest('[role="menuitem"]')) controller.close();
  });
  menuPopup.addEventListener('keydown', event => {
    const items = Array.from(menuPopup.querySelectorAll('[role="menuitem"]')).filter(item => !item.hidden && !item.disabled);
    const index = items.indexOf(document.activeElement);
    if(event.key === 'Escape'){
      event.preventDefault();
      controller.close();
      menuBtn.focus();
    } else if(event.key === 'ArrowDown' && items.length){
      event.preventDefault();
      items[(index + 1 + items.length) % items.length].focus();
    } else if(event.key === 'ArrowUp' && items.length){
      event.preventDefault();
      items[(index - 1 + items.length) % items.length].focus();
    }
  });
  return controller;
}
const newGameMenuController = registerHeaderMenu(newGameMenuEl, newGameMenuBtn, newGameMenuPopup, 'Neue-Partie-Menü');
const gamesMenuController = registerHeaderMenu(gamesMenuEl, gamesMenuBtn, gamesMenuPopup, 'Partien-Menü');
const playerMenuController = registerHeaderMenu(playerMenuEl, playerMenuBtn, playerMenuPopup, 'Spieler-Menü');
const toolsMenuController = registerHeaderMenu(toolsMenuEl, toolsMenuBtn, toolsMenuPopup, 'Tools-Menü');
const infoMenuController = registerHeaderMenu(infoMenuEl, infoMenuBtn, infoMenuPopup, 'Info-Menü');
function closeNewGameMenu(){ if(newGameMenuController) newGameMenuController.close(); }
function closeGamesMenu(){ if(gamesMenuController) gamesMenuController.close(); }
function closePlayerMenu(){ if(playerMenuController) playerMenuController.close(); }
function closeToolsMenu(){ if(toolsMenuController) toolsMenuController.close(); }
function closeInfoMenu(){ if(infoMenuController) infoMenuController.close(); }
document.addEventListener('click', event => {
  headerMenuControllers.forEach(controller => {
    if(!controller.menuEl.contains(event.target)) controller.close();
  });
});
document.addEventListener('keydown', event => {
  if(event.key !== 'Escape') return;
  headerMenuControllers.forEach(controller => {
    if(controller.menuEl.classList.contains('open')){
      controller.close();
      controller.menuBtn.focus();
    }
  });
});

const COLOR_SCHEME_STORAGE_KEY = 'hammerschachGamerColorScheme';
let darkModeEnabled = document.documentElement.classList.contains('dark-mode');
function updateThemeToggleUi(){
  if(!themeToggleBtn) return;
  themeToggleBtn.textContent = darkModeEnabled ? '☀️ Hell' : '🌙 Dunkel';
  themeToggleBtn.setAttribute('aria-pressed', darkModeEnabled ? 'true' : 'false');
  themeToggleBtn.setAttribute('aria-label', darkModeEnabled ? 'Helle Darstellung aktivieren' : 'Dunkle Darstellung aktivieren');
  themeToggleBtn.title = darkModeEnabled ? 'Zum hellen Modus wechseln' : 'Dark Mode aktivieren';
  if(themeColorMeta) themeColorMeta.setAttribute('content', darkModeEnabled ? '#111317' : '#843f46');
}
function setDarkMode(enabled){
  darkModeEnabled = !!enabled;
  document.documentElement.classList.toggle('dark-mode', darkModeEnabled);
  try{ localStorage.setItem(COLOR_SCHEME_STORAGE_KEY, darkModeEnabled ? 'dark' : 'light'); } catch(_){ }
  updateThemeToggleUi();
  postAnalyzerToolContext();
  postTrainerToolContext();
  postOpeningsToolContext();
  postFairplayToolContext();
  hammerschachScheduleHeightReport(true);
}
if(themeToggleBtn) themeToggleBtn.addEventListener('click', () => setDarkMode(!darkModeEnabled));
updateThemeToggleUi();
