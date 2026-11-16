/* Background sets for the rotation engine (web/backgrounds.js).
 *
 * CURATED: hand-picked images from the NASA Image and Video Library
 * (images.nasa.gov, public domain / NASA media guidelines), each checked for
 * a 16:9-friendly landscape crop and tagged so the scheduler can match them to
 * the time of day, weather, season, holidays, calendar events and launches.
 * Add an entry here (or a whole new tag) and the engine picks it up.
 *
 * Tags: dawn day dusk night | rain storm | winter autumn | rockets deepspace
 *       aurora voyage | celebration christmas halloween valentine
 */
(function () {
  'use strict';
  const OW = window.OW;

  /** Private house artwork is supplied separately; public builds use the owned sky. */
  OW.bgBundled = [];

  OW.bgCurated = [
    {
      "id": "nasa:carina_nebula",
      "nasaId": "carina_nebula",
      "title": "Cosmic Cliffs in the Carina Nebula",
      "credit": "NASA ESA CSA STScI",
      "tags": [
        "night",
        "deepspace",
        "valentine"
      ],
      "src": "https://images-assets.nasa.gov/image/carina_nebula/carina_nebula~large.jpg",
      "srcHi": "https://images-assets.nasa.gov/image/carina_nebula/carina_nebula~orig.png"
    },
    {
      "id": "nasa:iss072e159172",
      "nasaId": "iss072e159172",
      "title": "The aurora borealis blankets the Earth",
      "credit": "NASA",
      "tags": [
        "night",
        "aurora"
      ],
      "src": "https://images-assets.nasa.gov/image/iss072e159172/iss072e159172~large.jpg",
      "srcHi": "https://images-assets.nasa.gov/image/iss072e159172/iss072e159172~orig.jpg"
    },
    {
      "id": "nasa:iss066e146457",
      "nasaId": "iss066e146457",
      "title": "Aurora over the limb of Earth",
      "credit": "NASA",
      "tags": [
        "night",
        "aurora",
        "christmas"
      ],
      "src": "https://images-assets.nasa.gov/image/iss066e146457/iss066e146457~large.jpg",
      "srcHi": "https://images-assets.nasa.gov/image/iss066e146457/iss066e146457~orig.jpg"
    },
    {
      "id": "nasa:iss042e033478",
      "nasaId": "iss042e033478",
      "title": "Aurora and airglow from orbit",
      "credit": "NASA",
      "tags": [
        "night",
        "aurora"
      ],
      "src": "https://images-assets.nasa.gov/image/iss042e033478/iss042e033478~large.jpg",
      "srcHi": "https://images-assets.nasa.gov/image/iss042e033478/iss042e033478~orig.jpg"
    },
    {
      "id": "nasa:iss072e451060",
      "nasaId": "iss072e451060",
      "title": "A red and green aurora borealis above Canada's Gulf of St. Lawrence",
      "credit": "NASA",
      "tags": [
        "night",
        "aurora",
        "christmas",
        "celebration"
      ],
      "src": "https://images-assets.nasa.gov/image/iss072e451060/iss072e451060~large.jpg",
      "srcHi": "https://images-assets.nasa.gov/image/iss072e451060/iss072e451060~orig.jpg"
    },
    {
      "id": "nasa:iss043e125478",
      "nasaId": "iss043e125478",
      "title": "Airglow over Earth at night",
      "credit": "NASA / Terry Virts",
      "tags": [
        "night",
        "halloween"
      ],
      "src": "https://images-assets.nasa.gov/image/iss043e125478/iss043e125478~large.jpg",
      "srcHi": "https://images-assets.nasa.gov/image/iss043e125478/iss043e125478~orig.jpg"
    },
    {
      "id": "nasa:iss045e107821",
      "nasaId": "iss045e107821",
      "title": "City lights beneath the airglow",
      "credit": "NASA",
      "tags": [
        "night"
      ],
      "src": "https://images-assets.nasa.gov/image/iss045e107821/iss045e107821~large.jpg",
      "srcHi": "https://images-assets.nasa.gov/image/iss045e107821/iss045e107821~orig.jpg"
    },
    {
      "id": "nasa:iss070e062746",
      "nasaId": "iss070e062746",
      "title": "Night lights from the station",
      "credit": "NASA",
      "tags": [
        "night",
        "celebration"
      ],
      "src": "https://images-assets.nasa.gov/image/iss070e062746/iss070e062746~large.jpg",
      "srcHi": "https://images-assets.nasa.gov/image/iss070e062746/iss070e062746~orig.jpg"
    },
    {
      "id": "nasa:iss073e0685684",
      "nasaId": "iss073e0685684",
      "title": "The city lights of New Delhi, India, underneath a starry night sky",
      "credit": "NASA",
      "tags": [
        "night"
      ],
      "src": "https://images-assets.nasa.gov/image/iss073e0685684/iss073e0685684~large.jpg",
      "srcHi": "https://images-assets.nasa.gov/image/iss073e0685684/iss073e0685684~orig.jpg"
    },
    {
      "id": "nasa:iss042e037793",
      "nasaId": "iss042e037793",
      "title": "Moonrise over the night side",
      "credit": "NASA",
      "tags": [
        "night"
      ],
      "src": "https://images-assets.nasa.gov/image/iss042e037793/iss042e037793~large.jpg",
      "srcHi": "https://images-assets.nasa.gov/image/iss042e037793/iss042e037793~orig.jpg"
    },
    {
      "id": "nasa:iss072e487315",
      "nasaId": "iss072e487315",
      "title": "An orbital sunrise above Namibia in Africa",
      "credit": "NASA",
      "tags": [
        "dawn"
      ],
      "src": "https://images-assets.nasa.gov/image/iss072e487315/iss072e487315~large.jpg",
      "srcHi": "https://images-assets.nasa.gov/image/iss072e487315/iss072e487315~orig.jpg"
    },
    {
      "id": "nasa:iss065e013242",
      "nasaId": "iss065e013242",
      "title": "Orbital sunrise",
      "credit": "NASA",
      "tags": [
        "dawn"
      ],
      "src": "https://images-assets.nasa.gov/image/iss065e013242/iss065e013242~large.jpg",
      "srcHi": "https://images-assets.nasa.gov/image/iss065e013242/iss065e013242~orig.jpg"
    },
    {
      "id": "nasa:iss066e091822",
      "nasaId": "iss066e091822",
      "title": "First light on the atmosphere",
      "credit": "NASA",
      "tags": [
        "dawn",
        "dusk"
      ],
      "src": "https://images-assets.nasa.gov/image/iss066e091822/iss066e091822~large.jpg",
      "srcHi": "https://images-assets.nasa.gov/image/iss066e091822/iss066e091822~orig.jpg"
    },
    {
      "id": "nasa:iss071e439624",
      "nasaId": "iss071e439624",
      "title": "An orbital sunrise colorfully illuminates the Earth's atmosphere",
      "credit": "NASA",
      "tags": [
        "dawn",
        "dusk"
      ],
      "src": "https://images-assets.nasa.gov/image/iss071e439624/iss071e439624~large.jpg",
      "srcHi": "https://images-assets.nasa.gov/image/iss071e439624/iss071e439624~orig.jpg"
    },
    {
      "id": "nasa:iss066e109851",
      "nasaId": "iss066e109851",
      "title": "Sunrise over the terminator",
      "credit": "NASA",
      "tags": [
        "dusk",
        "autumn"
      ],
      "src": "https://images-assets.nasa.gov/image/iss066e109851/iss066e109851~large.jpg",
      "srcHi": "https://images-assets.nasa.gov/image/iss066e109851/iss066e109851~orig.jpg"
    },
    {
      "id": "nasa:iss044e059041",
      "nasaId": "iss044e059041",
      "title": "Sunrise from the station",
      "credit": "NASA / Scott Kelly",
      "tags": [
        "storm",
        "day"
      ],
      "src": "https://images-assets.nasa.gov/image/iss044e059041/iss044e059041~large.jpg",
      "srcHi": "https://images-assets.nasa.gov/image/iss044e059041/iss044e059041~orig.jpg"
    },
    {
      "id": "nasa:iss073e0814407",
      "nasaId": "iss073e0814407",
      "title": "Hurricane Humberto is seen in the Atlantic Ocean",
      "credit": "NASA",
      "tags": [
        "storm",
        "day"
      ],
      "src": "https://images-assets.nasa.gov/image/iss073e0814407/iss073e0814407~large.jpg",
      "srcHi": "https://images-assets.nasa.gov/image/iss073e0814407/iss073e0814407~orig.jpg"
    },
    {
      "id": "nasa:iss073e0766948",
      "nasaId": "iss073e0766948",
      "title": "Hurricane Gabrielle is seen in the Atlantic Ocean",
      "credit": "NASA",
      "tags": [
        "storm",
        "rain",
        "day"
      ],
      "src": "https://images-assets.nasa.gov/image/iss073e0766948/iss073e0766948~large.jpg",
      "srcHi": "https://images-assets.nasa.gov/image/iss073e0766948/iss073e0766948~orig.jpg"
    },
    {
      "id": "nasa:iss017e010706",
      "nasaId": "iss017e010706",
      "title": "Hurricane Bertha taken by the Expedition 17 Crew",
      "credit": "NASA",
      "tags": [
        "rain",
        "storm",
        "day"
      ],
      "src": "https://images-assets.nasa.gov/image/iss017e010706/iss017e010706~large.jpg",
      "srcHi": "https://images-assets.nasa.gov/image/iss017e010706/iss017e010706~orig.jpg"
    },
    {
      "id": "nasa:iss073e0281502",
      "nasaId": "iss073e0281502",
      "title": "Storm system from orbit",
      "credit": "NASA",
      "tags": [
        "storm",
        "night"
      ],
      "src": "https://images-assets.nasa.gov/image/iss073e0281502/iss073e0281502~large.jpg",
      "srcHi": "https://images-assets.nasa.gov/image/iss073e0281502/iss073e0281502~orig.jpg"
    },
    {
      "id": "nasa:iss074e0573450",
      "nasaId": "iss074e0573450",
      "title": "A mesoscale low\u2011pressure system spins in the South Pacific Ocean",
      "credit": "NASA",
      "tags": [
        "rain",
        "day"
      ],
      "src": "https://images-assets.nasa.gov/image/iss074e0573450/iss074e0573450~large.jpg",
      "srcHi": "https://images-assets.nasa.gov/image/iss074e0573450/iss074e0573450~orig.jpg"
    },
    {
      "id": "nasa:PIA12348",
      "nasaId": "PIA12348",
      "title": "The Milky Way\u2019s centre in three lights",
      "credit": "NASA/JPL-Caltech/ESA/CXC/STScI",
      "tags": [
        "night",
        "deepspace"
      ],
      "src": "https://images-assets.nasa.gov/image/PIA12348/PIA12348~large.jpg",
      "srcHi": "https://images-assets.nasa.gov/image/PIA12348/PIA12348~orig.jpg"
    },
    {
      "id": "nasa:PIA13932",
      "nasaId": "PIA13932",
      "title": "Stars gather in downtown Milky Way",
      "credit": "NASA/JPL-Caltech",
      "tags": [
        "night",
        "deepspace"
      ],
      "src": "https://images-assets.nasa.gov/image/PIA13932/PIA13932~large.jpg",
      "srcHi": "https://images-assets.nasa.gov/image/PIA13932/PIA13932~orig.jpg"
    },
    {
      "id": "nasa:art002e021278",
      "nasaId": "art002e021278",
      "title": "A Breathtaking Earthset from Orion",
      "credit": "NASA",
      "tags": [
        "night",
        "voyage"
      ],
      "src": "https://images-assets.nasa.gov/image/art002e021278/art002e021278~large.jpg",
      "srcHi": "https://images-assets.nasa.gov/image/art002e021278/art002e021278~orig.jpg"
    },
    {
      "id": "nasa:iss008e17326",
      "nasaId": "iss008e17326",
      "title": "Snow-capped volcano from orbit",
      "credit": "NASA",
      "tags": [
        "winter",
        "day"
      ],
      "src": "https://images-assets.nasa.gov/image/iss008e17326/iss008e17326~large.jpg",
      "srcHi": "https://images-assets.nasa.gov/image/iss008e17326/iss008e17326~orig.jpg"
    },
    {
      "id": "nasa:iss018e005353",
      "nasaId": "iss018e005353",
      "title": "Winter mountains from orbit",
      "credit": "NASA",
      "tags": [
        "winter",
        "day"
      ],
      "src": "https://images-assets.nasa.gov/image/iss018e005353/iss018e005353~large.jpg",
      "srcHi": "https://images-assets.nasa.gov/image/iss018e005353/iss018e005353~orig.jpg"
    },
    {
      "id": "nasa:iss030e162344",
      "nasaId": "iss030e162344",
      "title": "Cloud vortices over the ocean",
      "credit": "NASA",
      "tags": [
        "day",
        "winter"
      ],
      "src": "https://images-assets.nasa.gov/image/iss030e162344/iss030e162344~large.jpg",
      "srcHi": "https://images-assets.nasa.gov/image/iss030e162344/iss030e162344~orig.jpg"
    },
    {
      "id": "nasa:PIA06193",
      "nasaId": "PIA06193",
      "title": "The greatest Saturn portrait",
      "credit": "NASA/JPL/Space Science Institute",
      "tags": [
        "night",
        "deepspace"
      ],
      "src": "https://images-assets.nasa.gov/image/PIA06193/PIA06193~large.jpg",
      "srcHi": "https://images-assets.nasa.gov/image/PIA06193/PIA06193~orig.jpg"
    },
    {
      "id": "nasa:SLS_MAF_20260401_ArtemisIILaunch_05",
      "nasaId": "SLS_MAF_20260401_ArtemisIILaunch_05",
      "title": "Artemis II launch",
      "credit": "NASA/Michael DeMocker",
      "tags": [
        "rockets",
        "day",
        "celebration"
      ],
      "src": "https://images-assets.nasa.gov/image/SLS_MAF_20260401_ArtemisIILaunch_05/SLS_MAF_20260401_ArtemisIILaunch_05~large.jpg",
      "srcHi": "https://images-assets.nasa.gov/image/SLS_MAF_20260401_ArtemisIILaunch_05/SLS_MAF_20260401_ArtemisIILaunch_05~orig.JPG"
    },
    {
      "id": "nasa:SLS_MAF_20260401_ArtemisIILaunch_03",
      "nasaId": "SLS_MAF_20260401_ArtemisIILaunch_03",
      "title": "Artemis II launch",
      "credit": "NASA/Michael DeMocker",
      "tags": [
        "rockets",
        "day"
      ],
      "src": "https://images-assets.nasa.gov/image/SLS_MAF_20260401_ArtemisIILaunch_03/SLS_MAF_20260401_ArtemisIILaunch_03~large.jpg",
      "srcHi": "https://images-assets.nasa.gov/image/SLS_MAF_20260401_ArtemisIILaunch_03/SLS_MAF_20260401_ArtemisIILaunch_03~orig.JPG"
    },
    {
      "id": "nasa:SLS_MAF_20260401_ArtemisIILaunch_04",
      "nasaId": "SLS_MAF_20260401_ArtemisIILaunch_04",
      "title": "Artemis II launch",
      "credit": "NASA/Michael DeMocker",
      "tags": [
        "rockets",
        "day"
      ],
      "src": "https://images-assets.nasa.gov/image/SLS_MAF_20260401_ArtemisIILaunch_04/SLS_MAF_20260401_ArtemisIILaunch_04~large.jpg",
      "srcHi": "https://images-assets.nasa.gov/image/SLS_MAF_20260401_ArtemisIILaunch_04/SLS_MAF_20260401_ArtemisIILaunch_04~orig.JPG"
    },
    {
      "id": "nasa:SLS_MAF_20260401_ArtemisIILaunch_01",
      "nasaId": "SLS_MAF_20260401_ArtemisIILaunch_01",
      "title": "Artemis II launch",
      "credit": "NASA/Michael DeMocker",
      "tags": [
        "rockets",
        "day"
      ],
      "src": "https://images-assets.nasa.gov/image/SLS_MAF_20260401_ArtemisIILaunch_01/SLS_MAF_20260401_ArtemisIILaunch_01~large.jpg",
      "srcHi": "https://images-assets.nasa.gov/image/SLS_MAF_20260401_ArtemisIILaunch_01/SLS_MAF_20260401_ArtemisIILaunch_01~orig.JPG"
    },
    {
      "id": "nasa:KSC-20211110-PH-KLS03_0034",
      "nasaId": "KSC-20211110-PH-KLS03_0034",
      "title": "SpaceX Crew-3 Liftoff",
      "credit": "NASA/Kim Shiflett",
      "tags": [
        "rockets",
        "night",
        "celebration"
      ],
      "src": "https://images-assets.nasa.gov/image/KSC-20211110-PH-KLS03_0034/KSC-20211110-PH-KLS03_0034~large.jpg",
      "srcHi": "https://images-assets.nasa.gov/image/KSC-20211110-PH-KLS03_0034/KSC-20211110-PH-KLS03_0034~orig.jpg"
    },
    {
      "id": "nasa:KSC-20190302-PH_AWG05_0009",
      "nasaId": "KSC-20190302-PH_AWG05_0009",
      "title": "SpaceX Demo-1 Liftoff",
      "credit": "NASA/Tony Gray",
      "tags": [
        "rockets",
        "night"
      ],
      "src": "https://images-assets.nasa.gov/image/KSC-20190302-PH_AWG05_0009/KSC-20190302-PH_AWG05_0009~large.jpg",
      "srcHi": "https://images-assets.nasa.gov/image/KSC-20190302-PH_AWG05_0009/KSC-20190302-PH_AWG05_0009~orig.jpg"
    },
    {
      "id": "nasa:KSC-20221005-PH-KNO07_0039",
      "nasaId": "KSC-20221005-PH-KNO07_0039",
      "title": "SpaceX Crew-5 Liftoff, Remote Cam #9",
      "credit": "NASA/Kevin O'Connell & Chris Col",
      "tags": [
        "rockets",
        "day"
      ],
      "src": "https://images-assets.nasa.gov/image/KSC-20221005-PH-KNO07_0039/KSC-20221005-PH-KNO07_0039~large.jpg",
      "srcHi": "https://images-assets.nasa.gov/image/KSC-20221005-PH-KNO07_0039/KSC-20221005-PH-KNO07_0039~orig.jpg"
    },
    {
      "id": "nasa:PIA26077",
      "nasaId": "PIA26077",
      "title": "NASA's Juno Mission Images Jupiter's Belts and Zones",
      "credit": "NASA/JPL-Caltech/SwRI/MSSS Image processing by Tanya Oleksui",
      "tags": [
        "deepspace"
      ],
      "src": "https://images-assets.nasa.gov/image/PIA26077/PIA26077~large.jpg",
      "srcHi": "https://images-assets.nasa.gov/image/PIA26077/PIA26077~orig.jpg"
    },
    {
      "id": "nasa:PIA25015",
      "nasaId": "PIA25015",
      "title": "Juno Captures Moon Shadow on Jupiter",
      "credit": "NASA/JPL-Caltech/SwRI/MSSS Image processing by Thomas Thomop",
      "tags": [
        "deepspace",
        "halloween"
      ],
      "src": "https://images-assets.nasa.gov/image/PIA25015/PIA25015~large.jpg",
      "srcHi": "https://images-assets.nasa.gov/image/PIA25015/PIA25015~orig.jpg"
    },
    {
      "id": "nasa:PIA24937",
      "nasaId": "PIA24937",
      "title": "A Picture Postcard From Curiosity's Navcams",
      "credit": "NASA/JPL-Caltech",
      "tags": [
        "dusk",
        "autumn"
      ],
      "src": "https://images-assets.nasa.gov/image/PIA24937/PIA24937~large.jpg",
      "srcHi": "https://images-assets.nasa.gov/image/PIA24937/PIA24937~orig.jpg"
    },
    {
      "id": "nasa:PIA26680",
      "nasaId": "PIA26680",
      "title": "Curiosity Sends a Postcard From Mount Sharp\u2019s Boxwork Region",
      "credit": "NASA/JPL-Caltech",
      "tags": [
        "dusk",
        "autumn"
      ],
      "src": "https://images-assets.nasa.gov/image/PIA26680/PIA26680~large.jpg",
      "srcHi": "https://images-assets.nasa.gov/image/PIA26680/PIA26680~orig.jpg"
    },
    {
      "id": "nasa:iss028e007274",
      "nasaId": "iss028e007274",
      "title": "Orbital sunset",
      "credit": "NASA",
      "tags": [
        "dusk",
        "autumn"
      ],
      "src": "https://images-assets.nasa.gov/image/iss028e007274/iss028e007274~large.jpg",
      "srcHi": "https://images-assets.nasa.gov/image/iss028e007274/iss028e007274~orig.jpg"
    },
    {
      "id": "nasa:NHQ202208310004",
      "nasaId": "NHQ202208310004",
      "title": "Artemis I Prelaunch",
      "credit": "NASA/Bill Ingalls",
      "tags": [
        "dawn",
        "rockets",
        "halloween",
        "autumn"
      ],
      "src": "https://images-assets.nasa.gov/image/NHQ202208310004/NHQ202208310004~large.jpg",
      "srcHi": "https://images-assets.nasa.gov/image/NHQ202208310004/NHQ202208310004~orig.jpg"
    },
    {
      "id": "nasa:NHQ202208170016",
      "nasaId": "NHQ202208170016",
      "title": "Artemis I Rollout",
      "credit": "NASA/Joel Kowsky",
      "tags": [
        "dawn",
        "rockets"
      ],
      "src": "https://images-assets.nasa.gov/image/NHQ202208170016/NHQ202208170016~large.jpg",
      "srcHi": "https://images-assets.nasa.gov/image/NHQ202208170016/NHQ202208170016~orig.jpg"
    },
    {
      "id": "nasa:NHQ202209010003",
      "nasaId": "NHQ202209010003",
      "title": "Artemis I Prelaunch",
      "credit": "NASA/Joel Kowsky",
      "tags": [
        "dusk",
        "rockets"
      ],
      "src": "https://images-assets.nasa.gov/image/NHQ202209010003/NHQ202209010003~large.jpg",
      "srcHi": "https://images-assets.nasa.gov/image/NHQ202209010003/NHQ202209010003~orig.jpg"
    },
    {
      "id": "nasa:NHQ202208290006",
      "nasaId": "NHQ202208290006",
      "title": "Artemis I Preflight",
      "credit": "NASA/Joel Kowsky",
      "tags": [
        "dusk",
        "rockets"
      ],
      "src": "https://images-assets.nasa.gov/image/NHQ202208290006/NHQ202208290006~large.jpg",
      "srcHi": "https://images-assets.nasa.gov/image/NHQ202208290006/NHQ202208290006~orig.jpg"
    },
    {
      "id": "nasa:s132e013215",
      "nasaId": "s132e013215",
      "title": "Flyaround view of ISS after undocking",
      "credit": "NASA",
      "tags": [
        "day",
        "voyage"
      ],
      "src": "https://images-assets.nasa.gov/image/s132e013215/s132e013215~large.jpg",
      "srcHi": "https://images-assets.nasa.gov/image/s132e013215/s132e013215~orig.jpg"
    },
    {
      "id": "nasa:iss066e081189",
      "nasaId": "iss066e081189",
      "title": "The station above Earth",
      "credit": "NASA",
      "tags": [
        "day",
        "voyage"
      ],
      "src": "https://images-assets.nasa.gov/image/iss066e081189/iss066e081189~large.jpg",
      "srcHi": "https://images-assets.nasa.gov/image/iss066e081189/iss066e081189~orig.jpg"
    },
    {
      "id": "nasa:iss066e080300",
      "nasaId": "iss066e080300",
      "title": "International Space Station",
      "credit": "NASA",
      "tags": [
        "voyage",
        "night"
      ],
      "src": "https://images-assets.nasa.gov/image/iss066e080300/iss066e080300~large.jpg",
      "srcHi": "https://images-assets.nasa.gov/image/iss066e080300/iss066e080300~orig.jpg"
    },
    {
      "id": "nasa:PIA11707",
      "nasaId": "PIA11707",
      "title": "Pluto\u2019s heart",
      "credit": "NASA/Johns Hopkins University Applied Physics Laboratory/Sou",
      "tags": [
        "valentine",
        "deepspace"
      ],
      "src": "https://images-assets.nasa.gov/image/PIA11707/PIA11707~large.jpg",
      "srcHi": "https://images-assets.nasa.gov/image/PIA11707/PIA11707~orig.jpg"
    }
  ];

  /** Calendar keywords -> background set. `lead` = minutes before the event the set takes over. */
  OW.bgEventRules = [
    { id: 'birthday', label: 'birthday', match: /birthday|b-?day|party|anniversary|celebrat/i, tags: ['celebration', 'aurora'], lead: 720 },
    { id: 'trip', label: 'trip', match: /flight|trip|travel|airport|vacation|road ?trip/i, tags: ['voyage'], lead: 360 },
    { id: 'game', label: 'game day', match: /\bgame\b|match|kickoff|playoff|grand prix|\bf1\b|race day/i, tags: ['rockets'], lead: 180 },
    { id: 'dinner', label: 'dinner', match: /dinner|date night|restaurant|supper/i, tags: ['dusk'], lead: 120 },
    { id: 'movie', label: 'movie night', match: /movie|film|cinema/i, tags: ['deepspace'], lead: 90 },
    { id: 'launch', label: 'launch watch', match: /launch|starship|liftoff|rocket/i, tags: ['rockets'], lead: 240 },
  ];

  /** Seasonal / holiday sets, auto-enabled by date (month is 1-based). */
  OW.bgSeasonal = [
    { id: 'newyear', label: 'new year', tags: ['celebration'], on: (m, d) => (m === 12 && d === 31) || (m === 1 && d === 1) },
    { id: 'valentine', label: 'valentine\u2019s', tags: ['valentine'], on: (m, d) => m === 2 && d >= 13 && d <= 14 },
    { id: 'yuri', label: 'yuri\u2019s night', tags: ['rockets', 'voyage'], on: (m, d) => m === 4 && d === 12 },
    { id: 'july4', label: 'july 4th', tags: ['celebration', 'rockets'], on: (m, d) => m === 7 && d >= 3 && d <= 4 },
    { id: 'apollo', label: 'apollo 11 week', tags: ['voyage', 'rockets'], on: (m, d) => m === 7 && d >= 16 && d <= 24 },
    { id: 'halloween', label: 'halloween', tags: ['halloween'], on: (m, d) => m === 10 && d >= 25 },
    { id: 'thanksgiving', label: 'thanksgiving', tags: ['autumn', 'dusk'], on: (m, d, date) => { if (m !== 11) return false; const first = new Date(date.getFullYear(), 10, 1).getDay(); const th = 1 + ((11 - first) % 7) + 21; return d >= th - 1 && d <= th + 1; } },
    { id: 'christmas', label: 'holidays', tags: ['christmas', 'winter'], on: (m, d) => m === 12 && d >= 12 && d <= 26 },
    { id: 'winter', label: 'winter', tags: ['winter'], season: true, on: (m) => m === 12 || m <= 2 },
    { id: 'autumn', label: 'autumn', tags: ['autumn'], season: true, on: (m) => m >= 9 && m <= 11 },
  ];
})();
