'use strict';

/*
  Flächenorientierte Brettgröße:
  Auf Desktop-Ansichten begrenzen Breite und tatsächlich verfügbare Höhe
  gemeinsam das Brett. Tablet- und Smartphone-Ansichten bleiben bewusst
  breitenorientiert und stapeln die rechte Spalte unter das Brett.
*/
(function hammerschachResponsiveLayout(){
  const root = document.documentElement;
  const topLayout = document.querySelector('.top-layout');
  const boardColumn = document.querySelector('.board-column');
  const boardWrapper = document.querySelector('.board-wrapper');
  const desktopLayout = window.matchMedia('(min-width:1101px), (min-width:981px) and (orientation:landscape)');
  const embedded = window.self !== window.top;
  let layoutFrame = 0;
  let lastHeightLimit = 0;

  function elementIsVisible(element){
    if(!element || element.hidden) return false;
    const style = window.getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden';
  }

  function viewportHeight(){
    if(window.visualViewport && Number.isFinite(window.visualViewport.height)){
      return window.visualViewport.height;
    }
    return window.innerHeight || document.documentElement.clientHeight || 0;
  }

  function clearHeightLimit(){
    root.dataset.boardSizing = 'width';
    if(!lastHeightLimit && !root.style.getPropertyValue('--board-height-limit')) return;
    lastHeightLimit = 0;
    root.style.removeProperty('--board-height-limit');
  }

  function updateBoardHeightLimit(){
    layoutFrame = 0;
    if(embedded || !desktopLayout.matches || !elementIsVisible(topLayout) || !elementIsVisible(boardWrapper)){
      clearHeightLimit();
      return;
    }

    const boardRect = boardWrapper.getBoundingClientRect();
    const columnRect = boardColumn.getBoundingClientRect();
    const visibleHeight = viewportHeight();
    if(!visibleHeight){
      clearHeightLimit();
      return;
    }

    const boardTop = boardRect.top + (window.scrollY || window.pageYOffset || 0);
    const belowBoard = Math.max(0, columnRect.bottom - boardRect.bottom);
    const bottomBreathingRoom = 12;
    const calculatedLimit = Math.floor(visibleHeight - boardTop - belowBoard - bottomBreathingRoom);
    const nextLimit = Math.max(420, calculatedLimit);

    if(Math.abs(nextLimit - lastHeightLimit) < 2) return;
    lastHeightLimit = nextLimit;
    root.style.setProperty('--board-height-limit', `${nextLimit}px`);
    root.dataset.boardSizing = 'viewport';
  }

  function scheduleBoardLayout(){
    if(layoutFrame) cancelAnimationFrame(layoutFrame);
    layoutFrame = requestAnimationFrame(updateBoardHeightLimit);
  }

  window.hammerschachScheduleResponsiveLayout = scheduleBoardLayout;
  window.addEventListener('resize', scheduleBoardLayout, {passive:true});
  window.addEventListener('orientationchange', scheduleBoardLayout, {passive:true});
  if(window.visualViewport){
    window.visualViewport.addEventListener('resize', scheduleBoardLayout, {passive:true});
  }
  if(desktopLayout.addEventListener){
    desktopLayout.addEventListener('change', scheduleBoardLayout);
  } else if(desktopLayout.addListener){
    desktopLayout.addListener(scheduleBoardLayout);
  }

  if('ResizeObserver' in window){
    const resizeObserver = new ResizeObserver(scheduleBoardLayout);
    [document.querySelector('.shell'), document.querySelector('.header'), boardColumn]
      .filter(Boolean)
      .forEach(element => resizeObserver.observe(element));
  }

  if('MutationObserver' in window){
    const mutationObserver = new MutationObserver(scheduleBoardLayout);
    mutationObserver.observe(root, {attributes:true, attributeFilter:['class']});
    [topLayout, document.querySelector('#boardPlayerTop'), document.querySelector('#boardPlayerBottom'), document.querySelector('#playersPanel')]
      .filter(Boolean)
      .forEach(element => mutationObserver.observe(element, {attributes:true, attributeFilter:['hidden','class','style']}));
  }

  scheduleBoardLayout();
  window.addEventListener('load', scheduleBoardLayout, {once:true});
  if(document.fonts && document.fonts.ready){
    document.fonts.ready.then(scheduleBoardLayout).catch(() => {});
  }
})();
