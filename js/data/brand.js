/* Brand: the application's name and identity, taken from the supplied brand references in assets/brand
   (application icon and name wordmark). Used by the rail, the Home page and the page title. */
(function (AM) {
  'use strict';

  AM.brand = {
    name: 'Univicoustic',
    tagline: 'Makes Sound Sense',
    descriptor: 'Acoustic Measurement & Room Analysis',
    icon: 'assets/brand/univicoustic-icon.png',          // "UV" application icon, transparent background
    wordmark: 'assets/brand/univicoustic-wordmark.webp', // "UNIVICOUSTIC · MAKES SOUND SENSE", transparent background
    /* Official UniVicoustic websites, opened in a new browser tab: the product catalogue and the panel and wall
       configurator, both from Treatment's product browser (top right), and the configurator again from Final Result.
       They are links only: nothing from the project is sent to them, nothing from them enters the project, and the app
       works the same when they are unreachable. */
    links: {
      catalogue: 'https://catalog.univicoustic.com/',
      configurator: 'https://configurator.univicoustic.com/login',
    },
  };
})(window.AM);
