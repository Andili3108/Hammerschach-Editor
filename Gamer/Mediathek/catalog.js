'use strict';
// Gemeinsame Inhalte für das Gamer-Menü und die Mediathek.
// Videos: YouTube-ID, Titel. Keine automatisch geladenen Kanal-Feeds.
window.HAMMERSCHACH_MEDIATHEK = {
  categories: [
    {id:'filme',title:'Filme',icon:'🎬'},
    {id:'serien',title:'Serien',icon:'🎞️'},
    {id:'dokus',title:'Dokus',icon:'📽️'},
    {id:'streamer',title:'Streamer',icon:'🎙️'}
  ],
  entries: [
    {
      id:'bauernopfer',category:'filme',title:'Bauernopfer – Spiel der Könige',format:'Spielfilm · Trailer',
      source:'bauernopfer-spiel-der-koenige',
      lead:'Bobby Fischer und Boris Spasski: Ein Weltmeisterschaftskampf unter dem Druck des Kalten Krieges.',
      paragraphs:[
        'Der Film führt nach Reykjavík ins Jahr 1972. Bobby Fischer fordert Boris Spasski heraus, während die Öffentlichkeit in ihrem Duell weit mehr als einen sportlichen Wettkampf sieht. Vorbereitung, Rivalität und politischer Erwartungsdruck bestimmen das Geschehen.',
        'Edward Zwick inszeniert die Geschichte mit Tobey Maguire als Fischer und Liev Schreiber als Spasski. Der Film verbindet das Ringen am Brett mit Fischers persönlichen Konflikten. Als Spielfilm gestaltet er historische Ereignisse dramatisch aus.',
        'Für Schachfreunde steht besonders die mentale Seite des Wettkampfs im Mittelpunkt: Wie hält ein Spieler dem Druck stand, wenn jede Entscheidung weltweit beobachtet wird?'
      ],
      providers:[['Film bei Apple TV','https://tv.apple.com/de/movie/bauernopfer---spiel-der-konige/umc.cmc.14tokat77i92fmf47ym32q87a']],
      videos:[['0ku4i19g2Gs','Bauernopfer – Spiel der Könige · Trailer']]
    },
    {
      id:'die-schachspielerin',category:'filme',title:'Die Schachspielerin',format:'Spielfilm',source:'die-schachspielerin',
      lead:'Eine zufällige Begegnung mit dem Schach verändert Hélènes Alltag und eröffnet ihr neue Möglichkeiten.',
      paragraphs:[
        'Hélène entdeckt das Schachspiel und findet darin eine Herausforderung, die sie nicht mehr loslässt. Aus Neugier wird Ehrgeiz: Sie beginnt zu trainieren, erlebt Rückschläge und gewinnt mit ihren Fortschritten neues Selbstvertrauen.',
        'Das französisch-deutsche Drama von Caroline Bottaro stammt aus dem Jahr 2009. Sandrine Bonnaire und Kevin Kline spielen die Hauptrollen. Im Mittelpunkt stehen Hélènes Entwicklung und die Unterstützung durch einen erfahrenen Mentor.',
        'Der ruhige Film erzählt vom Mut, etwas Neues zu beginnen und sich eine eigene Leidenschaft zu erlauben. Die auf Andili ausgewählte deutschsprachige Filmfassung ist unten eingebunden.'
      ],
      videos:[['X4EASD47kL0','Die Schachspielerin · deutschsprachige Filmfassung']]
    },
    {
      id:'das-damengambit',category:'serien',title:'Das Damengambit',format:'Miniserie · Trailer',source:'das-damengambit',
      lead:'Beth Harmon entdeckt ihr Talent im Waisenhaus und kämpft sich in die internationale Schachelite.',
      paragraphs:[
        'Die Netflix-Miniserie folgt der fiktiven Schachspielerin Elizabeth „Beth“ Harmon. Ihre ersten Partien spielt sie in einem Waisenhaus in Kentucky. Aus dem außergewöhnlichen Talent entwickelt sich eine ehrgeizige Turnierspielerin, die sich in einer von Männern geprägten Schachwelt behauptet.',
        'Beths sportlicher Aufstieg verläuft nicht geradlinig. Persönliche Verluste, Einsamkeit und Abhängigkeit stehen ihrer Begabung gegenüber. Freundschaften und die Arbeit am eigenen Spiel werden ebenso wichtig wie ihr Gespür für das Brett.',
        'Die Serie basiert auf dem Roman von Walter Tevis und wurde von Scott Frank und Allan Scott entwickelt. Garri Kasparow und Bruce Pandolfini berieten die Produktion bei der Darstellung des Schachs. Den Trailer findest du hier; zur Serie führt der Netflix-Link.'
      ],
      providers:[['Serie bei Netflix','https://www.netflix.com/de/title/80234304']],
      videos:[['gijHVZ5YW4g','Das Damengambit · Trailer']]
    },
    {
      id:'queen-of-chess',category:'dokus',title:'Queen of Chess',format:'Dokumentarfilm · Trailer',source:'queen-of-chess',
      lead:'Judit Polgárs Weg an die Weltspitze – und ihr langer Kampf gegen Vorurteile im Schach.',
      image:{url:'https://upload.wikimedia.org/wikipedia/commons/thumb/2/29/Judit_Polgar.jpg/330px-Judit_Polgar.jpg',alt:'Judit Polgár',author:'Stefan64',source:'https://commons.wikimedia.org/wiki/File:Judit_Polgar.jpg',license:'CC BY-SA 3.0',licenseUrl:'https://creativecommons.org/licenses/by-sa/3.0/'},
      paragraphs:[
        'Judit Polgár trat gegen die stärksten Spieler der Welt an und erreichte die Top Ten der Weltrangliste. Der Dokumentarfilm von Rory Kennedy erzählt von ihrer Kindheit, dem Training in der Familie und ihrem Weg in die internationale Spitze.',
        'Eine zentrale Rolle spielt ihr sportliches Verhältnis zu Garri Kasparow. Interviews und Archivaufnahmen zeigen, mit welchen Erwartungen und Vorurteilen Polgár konfrontiert war – und wie sie sich ihren eigenen Platz im Schach erarbeitete.',
        'Queen of Chess ist seit dem 6. Februar 2026 bei Netflix veröffentlicht. Es handelt sich um einen Dokumentarfilm, nicht um eine Serie. Hier kannst du den Trailer starten oder die Titelseite bei Netflix öffnen.'
      ],
      providers:[['Dokumentarfilm bei Netflix','https://www.netflix.com/de/title/81749912']],
      references:[['Netflix · Informationen zum Film','https://www.netflix.com/tudum/articles/queen-of-chess-documentary-release-date-news']],
      videos:[['mKtU_0D4_oA','Queen of Chess · Trailer']]
    },
    {
      id:'mozart-des-schachs',category:'dokus',title:'Magnus – Der Mozart des Schachs',format:'Dokumentarfilm · Trailer',source:'mozart-des-schachs',
      lead:'Vom jungen Schachtalent zum Weltmeister: Benjamin Rees Dokumentarfilm über Magnus Carlsen.',
      paragraphs:[
        'Der Dokumentarfilm aus dem Jahr 2016 begleitet Magnus Carlsens Entwicklung bis zum Gewinn des klassischen Weltmeistertitels 2013. Private Aufnahmen und Archivmaterial geben Einblicke in seine Kindheit, das Familienleben und den Weg in den Spitzensport.',
        'Regisseur Benjamin Ree richtet den Blick auch auf die Menschen, die Carlsen begleiten. So entsteht ein Porträt über Talent, Unterstützung und die persönlichen Anforderungen einer außergewöhnlichen Laufbahn.',
        'Der Film erzählt einen bestimmten Abschnitt von Carlsens Karriere. Spätere Turniere und Titel gehören nicht zur Dokumentation. Unten stehen der Trailer und die verlinkten Anbieter bereit.'
      ],
      providers:[['Film bei Apple TV','https://tv.apple.com/de/movie/magnus---der-mozart-des-schachs/umc.cmc.5jwtybt37qogsfv4mr09kl7uk'],['Film bei Amazon Video','https://www.amazon.de/Magnus-Mozart-Schachs-Carlsen/dp/B01MTUFV6K']],
      videos:[['29C7FqQP7Vk','Magnus – Der Mozart des Schachs · Trailer']]
    },
    {
      id:'rebell-und-koenig',category:'dokus',title:'Garri Kasparow – Rebell und König des Schachspiels',menuTitle:'Rebell und König',format:'Dokumentation · ARTE',source:'garri-kasparow-rebell-und-koenig',
      lead:'Kasparows Aufstieg, seine Duelle mit Karpow und der Schritt vom Schachbrett in die öffentliche Debatte.',
      paragraphs:[
        'Die auf Andili ausgewählte ARTE-Dokumentation porträtiert Garri Kasparow als Schachspieler und öffentliche Persönlichkeit. Sie zeichnet seinen Weg vom Nachwuchstalent zum Weltmeister nach und beleuchtet seinen Ehrgeiz und seine intensive Vorbereitung.',
        'Die Weltmeisterschaftskämpfe gegen Anatoli Karpow gehören zu den prägenden Stationen dieser Laufbahn. Auch die Begegnungen mit IBMs Schachcomputer Deep Blue zeigen, wie eng Kasparows Geschichte mit den Veränderungen des Schachs verbunden ist.',
        'Das Porträt geht über die Turnierkarriere hinaus und behandelt auch Kasparows politische Positionierung. Sportliche Leistung und sein Wirken außerhalb des Schachs werden gemeinsam betrachtet.'
      ],
      videos:[['77P-Sv2mnq8','Garri Kasparow – Rebell und König des Schachspiels']]
    },
    {
      id:'bobby-fischer',category:'dokus',title:'Bobby Fischer',format:'Dokumentation · ARTE',source:'bobby-fischer',
      lead:'Aufstieg, Weltmeisterschaft und Rückzug: ein Porträt einer widersprüchlichen Schachpersönlichkeit.',
      paragraphs:[
        'Bobby Fischer sorgte bereits als Jugendlicher für Aufsehen. Sein Weg führte ihn 1972 zum Weltmeisterschaftskampf gegen Boris Spasski in Reykjavík – einem sportlichen Ereignis, das im Kalten Krieg weltweite Aufmerksamkeit erhielt.',
        'Die auf Andili ausgewählte Dokumentation blickt auf Fischers Karriere und seine Persönlichkeit. Historische Aufnahmen und die Geschichte seiner Wettkämpfe vermitteln ein Bild der Konzentration und Entschlossenheit, mit denen er das Schach verfolgte.',
        'Zu seinem Leben gehören auch Rückzug und öffentliche Konflikte. Das Porträt bietet damit einen anderen Zugang als der Spielfilm Bauernopfer: Es beschäftigt sich mit dem Menschen hinter der historischen Schachfigur.'
      ],
      videos:[['2rshakiq6tc','Bobby Fischer · Dokumentation']]
    },
    {
      id:'magnus-carlsen',category:'streamer',title:'Magnus Carlsen',format:'Porträt · Videos',source:'magnus-carlsen',
      lead:'Blitzpartien, ungewöhnliche Herausforderungen und Schachunterhaltung mit Magnus Carlsen.',
      image:{url:'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/Magnus_Carlsen_in_2025.jpg/250px-Magnus_Carlsen_in_2025.jpg',alt:'Magnus Carlsen',author:'Miroslav.vajdic',source:'https://commons.wikimedia.org/wiki/File:Magnus_Carlsen_in_2025.jpg',license:'CC BY 4.0',licenseUrl:'https://creativecommons.org/licenses/by/4.0/'},
      paragraphs:[
        'Magnus Carlsen ist auch in Online-Partien und unterhaltsamen Schachformaten präsent. Die hier zusammengestellte Auswahl zeigt ihn bei schnellen Duellen, ungewöhnlichen Eröffnungen und Begegnungen mit anderen Schachpersönlichkeiten.',
        'Die Clips stammen aus unterschiedlichen Situationen und Jahren. Sie zeigen sowohl sportlichen Ernst als auch lockere Showpartien. Drei Videos stehen direkt bereit; die übrige Auswahl lässt sich darunter aufklappen.'
      ],
      channel:['YouTube-Kanal von Magnus Carlsen','https://www.youtube.com/@themagnuscarlsen'],
      videos:[
        ['t9g3BuZ9WFA','Clips, die Magnus Carlsen berühmt machten'],
        ['zNDWn-JpWpA','Bongcloud zum Jahresauftakt 2026'],
        ['3J37FIm_jsU','Schäfermatt gegen einen starken Großmeister?'],
        ['fpfILPD4cCI','Titled Tuesday 2026 · Sieg in 17 Zügen'],
        ['3SLCXsrZ_mw','Eine ungewöhnliche Partie beim Titled Tuesday'],
        ['zLcJgzzO0eg','Kann Magnus alle in zehn Minuten besiegen?'],
        ['xmXwdoRG43U','Blind- und Blitzsimultan in New York'],
        ['4Phj-z8-AI4','Magnus kommt mit nur 30 Sekunden Spielzeit ans Brett'],
        ['1k201jBMZFQ','Die Botez-Schwestern gegen Magnus Carlsen'],
        ['3wqBFpcTs_8','Magnus gegen Alexandra mit 30 Sekunden'],
        ['AFz_llGhgoo','Heitere Momente beim Simultan in Kapstadt'],
        ['6_PMEpSvWNc','Drei Spielerinnen gegen Magnus Carlsen']
      ]
    },
    {
      id:'anna-cramling',category:'streamer',title:'Anna Cramling',format:'Porträt · Videos',source:'anna-cramling',
      lead:'Turniererfahrung, Parkschach und humorvolle Begegnungen mit Großmeistern.',
      image:{url:'https://upload.wikimedia.org/wikipedia/commons/2/21/Anna_Cramling_Tata_2023_-_43.jpg',alt:'Anna Cramling',author:'Frans Peeters Photography',source:'https://commons.wikimedia.org/wiki/File:Anna_Cramling_Tata_2023_-_43.jpg',license:'CC BY-SA 2.0',licenseUrl:'https://creativecommons.org/licenses/by-sa/2.0/'},
      paragraphs:[
        'Anna Cramling wuchs in einer Schachfamilie auf: Ihre Mutter Pia Cramling und ihr Vater Juan Manuel Bellón López sind Großmeister. Anna trägt den Titel Woman FIDE Master und verbindet eigene Turniererfahrung mit Videos und Streams.',
        'Ihre Formate reichen von Partien im Park bis zu Begegnungen mit Spitzenspielern. Die Auswahl zeigt zwei Duelle mit Magnus Carlsen und einen Auftritt ihrer Mutter Pia beim Parkschach in New York. Angaben im jeweiligen Video beziehen sich auf dessen Aufnahmezeit.'
      ],
      channel:['YouTube-Kanal von Anna Cramling','https://www.youtube.com/@AnnaCramling'],
      videos:[['hGEH21o0YOI','Anna gegen den blind spielenden Magnus Carlsen'],['IRIiFdw9N7c','Eine Partie gegen Magnus Carlsen im Retiro-Park'],['D19ctG4_rV4','Pia Cramling wird beim Parkschach unterschätzt']]
    },
    {
      id:'botezlive',category:'streamer',title:'BotezLive',format:'Porträt · Videos',source:'botezlive',
      lead:'Alexandra und Andrea Botez verbinden Schachpartien, Challenges und Begegnungen am Brett.',
      image:{url:'https://upload.wikimedia.org/wikipedia/commons/a/ac/AlexandraBotez_Trivia.png',alt:'Alexandra Botez',author:'Optic Gaming',source:'https://commons.wikimedia.org/wiki/File:AlexandraBotez_Trivia.png',license:'CC BY 3.0',licenseUrl:'https://creativecommons.org/licenses/by/3.0/'},
      paragraphs:[
        'Hinter BotezLive stehen die Schwestern Alexandra und Andrea Botez. Ihre Videos verbinden schnelle Partien mit Gesprächen, Herausforderungen und spontanen Begegnungen. Schach wird dabei auch als gemeinsames Unterhaltungserlebnis gezeigt.',
        'Die Auswahl zeigt eine Parkpartie gegen den jungen Tani, ein Gespräch mit Magnus Carlsen und eine Partie, die eine Siegesserie beendet. Die Videotitel sind an die aktuell verlinkten Beiträge angepasst.'
      ],
      channel:['YouTube-Kanal von BotezLive','https://www.youtube.com/@BotezLive'],
      videos:[['GoaC6mXpsto','Alexandra gegen den jungen Schachmeister Tani'],['IGffvQ9GB8U','Sieben Minuten ungewöhnliche Fragen an Magnus Carlsen'],['eGqp2haxHKo','Bis zu dieser Partie blieb ich ungeschlagen']]
    }
  ]
};

// Metadaten der ursprünglichen Videoverweise, geprüft am 7. September 2026.
window.HAMMERSCHACH_MEDIATHEK.videoMetadata = {
  "0ku4i19g2Gs": {
    "thumbnail": "https://i.ytimg.com/vi/0ku4i19g2Gs/hqdefault.jpg",
    "author": "STUDIOCANAL Germany"
  },
  "X4EASD47kL0": {
    "thumbnail": "https://i.ytimg.com/vi/X4EASD47kL0/hqdefault.jpg",
    "author": "Free Films Emotion"
  },
  "gijHVZ5YW4g": {
    "thumbnail": "https://i.ytimg.com/vi/gijHVZ5YW4g/hqdefault.jpg",
    "author": "KinoStarDE"
  },
  "mKtU_0D4_oA": {
    "thumbnail": "https://i.ytimg.com/vi/mKtU_0D4_oA/hqdefault.jpg",
    "author": "Trailer HQ"
  },
  "29C7FqQP7Vk": {
    "thumbnail": "https://i.ytimg.com/vi/29C7FqQP7Vk/hqdefault.jpg",
    "author": "kinofilme"
  },
  "77P-Sv2mnq8": {
    "thumbnail": "https://i.ytimg.com/vi/77P-Sv2mnq8/hqdefault.jpg",
    "author": "Schacheule"
  },
  "2rshakiq6tc": {
    "thumbnail": "https://i.ytimg.com/vi/2rshakiq6tc/hqdefault.jpg",
    "author": "Luan Lapi"
  },
  "t9g3BuZ9WFA": {
    "thumbnail": "https://i.ytimg.com/vi/t9g3BuZ9WFA/hqdefault.jpg",
    "author": "Chess Thugs"
  },
  "zNDWn-JpWpA": {
    "thumbnail": "https://i.ytimg.com/vi/zNDWn-JpWpA/hqdefault.jpg",
    "author": "Magnus Carlsen"
  },
  "3J37FIm_jsU": {
    "thumbnail": "https://i.ytimg.com/vi/3J37FIm_jsU/hqdefault.jpg",
    "author": "Magnus Teaches Chess"
  },
  "fpfILPD4cCI": {
    "thumbnail": "https://i.ytimg.com/vi/fpfILPD4cCI/hqdefault.jpg",
    "author": "Magnus Carlsen"
  },
  "3SLCXsrZ_mw": {
    "thumbnail": "https://i.ytimg.com/vi/3SLCXsrZ_mw/hqdefault.jpg",
    "author": "Magnus Carlsen"
  },
  "zLcJgzzO0eg": {
    "thumbnail": "https://i.ytimg.com/vi/zLcJgzzO0eg/hqdefault.jpg",
    "author": "Take Take Take"
  },
  "xmXwdoRG43U": {
    "thumbnail": "https://i.ytimg.com/vi/xmXwdoRG43U/hqdefault.jpg",
    "author": "Magnus Carlsen"
  },
  "4Phj-z8-AI4": {
    "thumbnail": "https://i.ytimg.com/vi/4Phj-z8-AI4/hqdefault.jpg",
    "author": "Chess.com"
  },
  "1k201jBMZFQ": {
    "thumbnail": "https://i.ytimg.com/vi/1k201jBMZFQ/hqdefault.jpg",
    "author": "BotezLive"
  },
  "3wqBFpcTs_8": {
    "thumbnail": "https://i.ytimg.com/vi/3wqBFpcTs_8/hqdefault.jpg",
    "author": "Daily Dose of Chess Clips"
  },
  "AFz_llGhgoo": {
    "thumbnail": "https://i.ytimg.com/vi/AFz_llGhgoo/hqdefault.jpg",
    "author": "ChessBase India"
  },
  "6_PMEpSvWNc": {
    "thumbnail": "https://i.ytimg.com/vi/6_PMEpSvWNc/hqdefault.jpg",
    "author": "BotezLive"
  },
  "hGEH21o0YOI": {
    "thumbnail": "https://i.ytimg.com/vi/hGEH21o0YOI/hqdefault.jpg",
    "author": "Anna Cramling"
  },
  "IRIiFdw9N7c": {
    "thumbnail": "https://i.ytimg.com/vi/IRIiFdw9N7c/hqdefault.jpg",
    "author": "Anna Cramling"
  },
  "D19ctG4_rV4": {
    "thumbnail": "https://i.ytimg.com/vi/D19ctG4_rV4/hqdefault.jpg",
    "author": "Anna Cramling"
  },
  "GoaC6mXpsto": {
    "thumbnail": "https://i.ytimg.com/vi/GoaC6mXpsto/hqdefault.jpg",
    "author": "BotezLive"
  },
  "IGffvQ9GB8U": {
    "thumbnail": "https://i.ytimg.com/vi/IGffvQ9GB8U/hqdefault.jpg",
    "author": "BotezLive"
  },
  "eGqp2haxHKo": {
    "thumbnail": "https://i.ytimg.com/vi/eGqp2haxHKo/hqdefault.jpg",
    "author": "BotezLive"
  }
};
