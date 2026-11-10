<?php
/**
 * Researched starting attractions (Phase 10). Imported by `wp ek import-guide`.
 * Every fact here is backed by the sources listed with it; see docs/research/phase10-sources.md
 * for confidence levels and the places where sources disagree. Opening hours and fees were not
 * confirmed for any place, so they are left empty: visitors see "Not yet confirmed".
 *
 * Keys: title, slug, categories (slugs), lga, lat, lng, pin_note, excerpt, content (HTML),
 * history (HTML), best_time, directions, sources ("Title | URL" lines), photos (keys in
 * sample-data/media/credits.json), captions (photo key => caption).
 *
 * @package ExploreKatsina
 */

defined( 'ABSPATH' ) || exit;

return array(

	array(
		'title'      => 'Gobarau Minaret',
		'slug'       => 'gobarau-minaret',
		'categories' => array( 'historic', 'religious' ),
		'lga'        => 'Katsina',
		'lat'        => 12.9980,
		'lng'        => 7.5955,
		'pin_note'   => '',
		'excerpt'    => 'A tower of earth about 15 metres high in Katsina\'s old city, all that still stands of the mosque that made Katsina a centre of Islamic learning.',
		'content'    => '<p>The Gobarau Minaret is a tower of earth about 15 metres (50 feet) high in the old city of Katsina. It is what still stands of the old Gobarau Mosque, which for centuries was Katsina\'s central mosque.</p>
<p>The minaret is built of earth in the traditional style of the region, and it has become a symbol of the city. Tradition says the tower was also used as a lookout over Katsina.</p>',
		'history'    => '<p>Sources link the mosque to the reign of Sarkin Katsina Muhammadu Korau in the 15th century, and to the scholar Muhammad al-Maghili, who came from Tlemcen in present-day Algeria. The dates given by sources range from the 14th to the 16th century.</p>
<p>By the early 16th century the mosque had become a centre of higher Islamic learning, drawing scholars and students to Katsina.</p>
<p>It stayed Katsina\'s central mosque until the time of Ummarun Dallaje (Emir from 1805 to 1835), when a new central mosque was built. The minaret was renovated during the reign of Emir Muhammadu Kabir Usman (1981–2008).</p>',
		'best_time'  => 'The cooler months (roughly November to February), early in the morning or late in the afternoon. This is a religious heritage site: dress modestly and be respectful at prayer times.',
		'directions' => 'In Katsina\'s old city, about 600 m north-west of the Emir\'s palace (straight line). Ask a keke (tricycle taxi) driver for "Gobarau".',
		'sources'    => "Wikipedia: Gobarau Minaret | https://en.wikipedia.org/wiki/Gobarau_Minaret
Trust Radio: Gobarau, story of the 664-year-old minaret | https://trustradio.com.ng/en/gobarau-story-of-the-664-year-old-minaret
BusinessDay (archived): Gobarau Minaret, the living past of Katsina | https://web.archive.org/web/20120215222000/http://www.businessdayonline.com/Businesslife/index.php?option=com_content&view=article&id=135:gobarau-minaret-the-living-past-of-katsina&catid=5:where2spendit&Itemid=7
World History Encyclopedia: Gobarau Minaret, Katsina | https://www.worldhistory.org/image/10546/gobarau-minaret-katsina/",
		'photos'     => array( 'gobarau-1', 'gobarau-3' ),
		'captions'   => array(
			'gobarau-1' => 'The Gobarau Minaret, Katsina',
			'gobarau-3' => 'The view from the top of the Gobarau Minaret',
		),
	),

	array(
		'title'      => 'Emir of Katsina\'s Palace (Gidan Korau)',
		'slug'       => 'emir-of-katsina-palace',
		'categories' => array( 'palace', 'historic' ),
		'lga'        => 'Katsina',
		'lat'        => 12.99467,
		'lng'        => 7.59928,
		'pin_note'   => 'The pin is at the main gate, Kofar Soro.',
		'excerpt'    => 'The seat of the Emir of Katsina, in the heart of the old city, and the centre of the Sallah Durbar.',
		'content'    => '<p>The palace of the Emir of Katsina stands in the centre of the old walled city and is the seat of the Katsina Emirate. It is often called Gidan Korau, after Sarkin Katsina Muhammadu Korau. Its main gate is Kofar Soro.</p>
<p>This is a working royal palace, not a museum. You can see the main gate from the street. Ask locally, for example through your hotel or a tour guide, whether and how a visit inside can be arranged.</p>
<p>During Sallah (the Eid festivals) the palace is the centre of the Durbar: horsemen pay homage to the Emir at Kofar Soro. See the <a href="{{event:sallah-durbar-katsina}}">Sallah Durbar</a>.</p>',
		'history'    => '<p>Sources disagree on when the palace was founded: some give 1348, while others link it to Korau\'s reign in the 15th century.</p>
<p>Tourism sources describe parts of the palace called Soro, Barga and Gidan Ganye. We have not yet been able to confirm these details.</p>',
		'best_time'  => 'Sallah (Eid) days, when the Durbar starts at the palace. Dates follow the Islamic calendar. At other times, any day, with respect for a working royal residence.',
		'directions' => 'In the centre of Katsina\'s old city. Ask for Kofar Soro, the main gate. The Gobarau Minaret is about 600 m away (straight line).',
		'sources'    => "Nigeria Galleria: Emir's Palace, Katsina | https://www.nigeriagalleria.com/Nigeria/States_Nigeria/Katsina/Emirs-Palace-Katsina.html
Wikiwand: Emir of Katsina | https://www.wikiwand.com/en/articles/Emir_of_Katsina
Voice of Nigeria: Katsina shines bright in grand Eid-ul-Fitr celebration | https://von.gov.ng/katsina-shines-bright-in-grand-eid-ul-fitr-celebration/
OpenStreetMap: Kofar Soro (location) | https://www.openstreetmap.org/#map=18/12.99467/7.59928",
		'photos'     => array( 'katsina-palace-1' ),
		'captions'   => array( 'katsina-palace-1' => 'The front gate of the Emir of Katsina\'s palace' ),
	),

	array(
		'title'      => 'Katsina ancient city walls and gates',
		'slug'       => 'katsina-city-walls-and-gates',
		'categories' => array( 'historic' ),
		'lga'        => 'Katsina',
		'lat'        => 13.00955,
		'lng'        => 7.61389,
		'pin_note'   => 'The pin is at Kofar Sauri. Other gates are around the old city: see the Katsina Map.',
		'excerpt'    => 'What remains of the earth walls (ganuwa) that once circled old Katsina, and the gates (kofa) whose names are still used across the city.',
		'content'    => '<p>Old Katsina was enclosed by thick earth walls, the <em>ganuwa</em>, with gates (<em>kofa</em>) where the roads entered the city. Sources put the length of the walls at about 21 km; one source says 24 km. Much of the wall has worn away, but stretches survive, and several gates have been rebuilt or restored as monuments.</p>
<p>Gates named by sources include Kofar Guga, Kofar Sauri, Kofar Marusa, Kofar Kaura (Kwaura), Kofar Kwaya, Kofar Durbi, Kofar Keke and Kofar Yandaka. Their names are still used today for roads, roundabouts and neighbourhoods.</p>
<p><strong>Where to see them:</strong> gate monuments are mapped at Kofar Sauri (north-east of the old city), Kofar Durbi (east), Kofar Kaura (south) and Kofar Guga (west).</p>',
		'history'    => '<p>Katsina is traditionally dated to around the 12th century. It grew into one of the great trading cities of the Hausa states, on trade routes across the Sahara. The walls protected the city and controlled who came in and went out.</p>
<p>Sources disagree on which gate is closest to its original form. Sunday Trust reported that Kofar Marusa, renovated in 2007, is the only gate still in its original form, while other reports describe restoration work at Kofar Sauri and Kofar Yandaka.</p>',
		'best_time'  => 'Early morning or late afternoon for the best light for photos. The cooler months run roughly November to February.',
		'directions' => 'The gates are around the edge of the old city. A keke (tricycle taxi) can take you from gate to gate. Kofar Sauri is in the north-east and Kofar Guga in the west.',
		'sources'    => "Wikipedia: Katsina | https://en.wikipedia.org/wiki/Katsina
Wikipedia: Gates of Hausa kingdoms | https://en.wikipedia.org/wiki/Gates_of_Hausa_kingdoms
Trust Radio: Nigeria's collapsing city walls | https://trustradio.com.ng/en/nigerias-collapsing-city-walls
Trust Radio: Amazing ancient Katsina | https://trustradio.com.ng/en/amazing-ancient-katsina
OpenStreetMap: gate locations | https://www.openstreetmap.org/#map=14/12.995/7.603",
		'photos'     => array( 'katsina-gate-sauri', 'katsina-gate-kwaya' ),
		'captions'   => array(
			'katsina-gate-sauri' => 'Kofar Sauri, one of Katsina\'s city gates',
			'katsina-gate-kwaya' => 'Kofar Kwaya, Katsina',
		),
	),

	array(
		'title'      => 'Kusugu Well (Daura)',
		'slug'       => 'kusugu-well-daura',
		'categories' => array( 'historic' ),
		'lga'        => 'Daura',
		'lat'        => 13.0413,
		'lng'        => 8.3288,
		'pin_note'   => 'Approximate location. Please confirm on arrival.',
		'excerpt'    => 'The well at the heart of the Bayajidda legend, the story of how the Hausa states began.',
		'content'    => '<p>Kusugu Well in Daura is famous across Hausaland because of the legend told about it.</p>
<p>According to the legend, a stranger named Bayajidda arrived in Daura and found that people could draw water from Kusugu only once a week, because a great snake called Sarki lived in the well. Bayajidda killed the snake. Queen Daurama of Daura married him, and their descendants are said to have founded the Hausa Bakwai, the seven original Hausa states.</p>
<p>Today the well is protected by a shelter and is visited by people who come for the story. Some sources say a sword believed to be Bayajidda\'s is kept by the Emir of Daura; we have not been able to confirm this.</p>',
		'history'    => '<p>The Bayajidda story is a legend, not a dated historical record, and sources place it at different times, from the 7th to the 10th century. It remains central to Hausa identity and to Daura\'s place as the spiritual home of the Hausa people.</p>',
		'best_time'  => 'The cooler months (roughly November to February). Combine your visit with the Emir of Daura\'s Palace, about 1.3 km away (straight line).',
		'directions' => 'In Daura town, about 80 km by road east of Katsina city. Ask locally for "Rijiyar Kusugu" (Kusugu Well).',
		'sources'    => "Wikipedia: Bayajidda | https://en.wikipedia.org/wiki/Bayajidda
Wikipedia: Daura | https://en.wikipedia.org/wiki/Daura
Wikipedia: Kusugu | https://en.wikipedia.org/wiki/Kusugu
Ebira Online: History of Kusugu Well in Daura | https://www.ebiraonline.com.ng/2023/11/history-of-kusugu-well-in-daura.html",
		'photos'     => array( 'kusugu-1', 'daura-gate-bayajidda' ),
		'captions'   => array(
			'kusugu-1'             => 'Kusugu Well, Daura',
			'daura-gate-bayajidda' => 'Inside Kofar Bayajidda, a gate in Daura named after Bayajidda',
		),
	),

	array(
		'title'      => 'Emir of Daura\'s Palace',
		'slug'       => 'emir-of-daura-palace',
		'categories' => array( 'palace', 'historic' ),
		'lga'        => 'Daura',
		'lat'        => 13.0364,
		'lng'        => 8.3178,
		'pin_note'   => 'Approximate location (Daura town centre). Please confirm on arrival.',
		'excerpt'    => 'The seat of the Emir of Daura, in the town often called the spiritual home of the Hausa people.',
		'content'    => '<p>The Emir of Daura\'s palace stands in the old town of Daura. Daura is counted among the seven original Hausa states and, through the Bayajidda legend, is often called the spiritual home of the Hausa people.</p>
<p>Like the palace in Katsina, it is a working royal residence. Ask locally whether and how a visit can be arranged.</p>
<p>Daura holds Durbar celebrations at both Eid festivals (Sallah) and at Mawlid (the Prophet\'s birthday), when horsemen ride to pay homage to the Emir.</p>',
		'history'    => '<p>Daura came under Fulani rule in 1805, during the jihad of the early 19th century. In 1904 the British installed Malam Musa as Emir. According to Wikipedia, Umar Faruk Umar became Emir of Daura on 28 February 2007.</p>',
		'best_time'  => 'Sallah (Eid) days for the Durbar; dates follow the Islamic calendar. Otherwise the cooler months, roughly November to February.',
		'directions' => 'Daura town centre, about 80 km by road east of Katsina city. Kusugu Well is about 1.3 km away (straight line).',
		'sources'    => "Wikipedia: Daura Emirate | https://en.wikipedia.org/wiki/Daura_Emirate
Wikipedia: Daura | https://en.wikipedia.org/wiki/Daura",
		'photos'     => array( 'daura-palace-1', 'daura-palace-2' ),
		'captions'   => array(
			'daura-palace-1' => 'The Emir\'s palace, Daura',
			'daura-palace-2' => 'The Emir\'s palace, Daura',
		),
	),

	array(
		'title'      => 'Zobe Dam',
		'slug'       => 'zobe-dam',
		'categories' => array( 'nature' ),
		'lga'        => 'Dutsin-Ma',
		'lat'        => 12.38833,
		'lng'        => 7.47472,
		'pin_note'   => '',
		'excerpt'    => 'A large reservoir on the Karaduwa River near Dutsin-Ma, built between 1972 and 1983.',
		'content'    => '<p>Zobe Dam holds back the Karaduwa River near Dutsin-Ma, south of Katsina city, creating a wide reservoir. Sources give its storage capacity as between about 140 and 179 million cubic metres.</p>
<p>This is public water infrastructure, not a developed tourist site. Access to the dam and its banks may be restricted: ask locally before you go, and do not swim in the reservoir.</p>',
		'history'    => '<p>Construction began in 1972 and finished in 1983. For many years the dam was described as under-used. A water supply scheme drawing on the dam was commissioned around 2020, and further projects have been announced.</p>',
		'best_time'  => 'The rainy season runs roughly June to September, when the landscape is greenest. The cooler dry months are roughly November to February.',
		'directions' => 'Near Dutsin-Ma town, about 70 km south of Katsina city (straight line). Ask locally about the road and access.',
		'sources'    => "Wikipedia: Zobe Dam | https://en.wikipedia.org/wiki/Zobe_Dam
ThisDay: Katsina State celebrates 30 years of statehood (2017) | https://www.thisdaylive.com/2017/10/03/katsina-state-celebrates-30-years-of-statehood/
Daily Trust (via PressReader), 30 April 2021 | https://www.pressreader.com/nigeria/daily-trust/20210430/281535113847047",
		'photos'     => array(),
	),

	array(
		'title'      => 'Ajiwa Dam',
		'slug'       => 'ajiwa-dam',
		'categories' => array( 'nature' ),
		'lga'        => 'Batagarawa',
		'lat'        => 12.92653,
		'lng'        => 7.75783,
		'pin_note'   => 'Pin from OpenStreetMap. Sources differ on the LGA (Batagarawa or Rimi).',
		'excerpt'    => 'The reservoir that supplies water to Katsina city, east of the capital, with planted green areas around it.',
		'content'    => '<p>Ajiwa Dam is a reservoir east of Katsina city. It supplies the city\'s water through the Ajiwa water treatment works. Photographs show planted green areas and tree plantations around the reservoir.</p>
<p>As a water supply site, parts of it may be restricted. Ask locally before visiting, and do not swim in the reservoir.</p>',
		'history'    => '<p>The Ajiwa water treatment works dates from the 1970s (one source says 1975). ThisDay reported in 2017 that it could treat around 50 million litres of water a day. The works has been rehabilitated in recent years.</p>',
		'best_time'  => 'The cooler months (roughly November to February), or just after the rains, when the area is green.',
		'directions' => 'About 18 km east-south-east of Katsina city (straight line). Ask locally for the road and about access.',
		'sources'    => "Wikipedia: Ajiwa Dam | https://en.wikipedia.org/wiki/Ajiwa_Dam
ThisDay: Katsina State celebrates 30 years of statehood (2017) | https://www.thisdaylive.com/2017/10/03/katsina-state-celebrates-30-years-of-statehood/
OpenStreetMap: Ajiwa Dam (location) | https://www.openstreetmap.org/#map=14/12.9265/7.7578",
		'photos'     => array( 'ajiwa-1' ),
		'captions'   => array( 'ajiwa-1' => 'Ajiwa Dam' ),
	),

	array(
		'title'      => 'Katsina Central Market',
		'slug'       => 'katsina-central-market',
		'categories' => array( 'market', 'crafts' ),
		'lga'        => 'Katsina',
		'lat'        => 12.97114,
		'lng'        => 7.60164,
		'pin_note'   => 'Pin from OpenStreetMap: Dutsin-Ma Road, near the Kofar Kwaya roundabout.',
		'excerpt'    => 'Katsina\'s busy central market on Dutsin-Ma Road, near the Kofar Kwaya roundabout.',
		'content'    => '<p>Katsina Central Market is on Dutsin-Ma Road near the Kofar Kwaya roundabout, just south of the old city. Katsina has long been a trading city. Its markets deal in grain such as sorghum and millet, onions and other vegetables, groundnuts, livestock, cotton and indigo-dyed cloth.</p>
<p>The area is known for crafts such as weaving, dyeing, leatherwork and pottery. Prices are usually negotiated.</p>
<p>A fire on 22 March 2021 destroyed many shops in the market, so some sections may have been rebuilt or moved since.</p>',
		'history'    => '<p>Katsina grew rich as a market city on trade routes across the Sahara and within Hausaland. A fire on 22 March 2021 destroyed a large number of shops; reports gave figures of between 100 and 200.</p>',
		'best_time'  => 'Mornings, before the midday heat.',
		'directions' => 'On Dutsin-Ma Road near the Kofar Kwaya roundabout. Ask a keke (tricycle taxi) driver for the central market near Kofar Kwaya.',
		'sources'    => "Britannica: Katsina | https://www.britannica.com/place/Katsina
HumAngle: Fire razes market in northwest Nigeria | https://www.humanglemedia.com/fire-razes-market-in-northwest-nigeria
Trust Radio: Fire outbreak, a Katsina trader's story | https://trustradio.com.ng/en/fire-outbreak-i-lost-years-of-hard-work-within-minutes-katsina-trader
OpenStreetMap: Katsina Central Market (location) | https://www.openstreetmap.org/#map=17/12.97114/7.60164",
		'photos'     => array(),
	),

	array(
		'title'      => 'Durbi Takusheyi',
		'slug'       => 'durbi-takusheyi',
		'categories' => array( 'historic' ),
		'lga'        => 'Mani',
		'lat'        => 12.94583,
		'lng'        => 7.88194,
		'pin_note'   => '',
		'excerpt'    => 'Burial mounds of early Katsina rulers, about 30 km east of the city and a national monument since 1959.',
		'content'    => '<p>Durbi Takusheyi is a group of burial mounds about 30 km east of Katsina city. They are believed to hold early rulers of Katsina.</p>
<p>Excavations found grave goods that show Katsina\'s early links with trade across the Sahara. The site was declared a national monument in 1959.</p>
<p>There is little visitor information. Ask locally, or at the National Museum in Katsina, before you go.</p>',
		'history'    => '<p>The mounds date roughly from the 13th or 14th century to the 16th century. The first recorded excavation was in 1907, by the British colonial official H. R. Palmer, and later excavations studied the graves and what they contained. The site was declared a national monument on 23 April 1959.</p>',
		'best_time'  => 'The cooler months (roughly November to February).',
		'directions' => 'In Mani LGA, about 30 km east of Katsina city (straight line). Ask locally for the road.',
		'sources'    => 'Wikipedia: Durbi Takusheyi | https://en.wikipedia.org/wiki/Durbi_Takusheyi',
		'photos'     => array(),
	),

	array(
		'title'      => 'National Museum, Katsina',
		'slug'       => 'national-museum-katsina',
		'categories' => array( 'museum', 'historic' ),
		'lga'        => 'Katsina',
		'lat'        => '',
		'lng'        => '',
		'pin_note'   => '',
		'excerpt'    => 'A national museum in the historic building of the old Katsina College, opened in the early 1920s.',
		'content'    => '<p>The National Museum in Katsina is housed in the historic building of the old Katsina College (Katsina Training College), which opened in the early 1920s. The college was the forerunner of Barewa College, which later moved to Zaria and educated many of northern Nigeria\'s leaders.</p>
<p>We have not yet confirmed the museum\'s exact location, opening hours, fees or current exhibitions. Please check locally before you go.</p>',
		'history'    => '<p>Sources differ on whether Katsina College was founded in 1921 or 1922.</p>',
		'best_time'  => '',
		'directions' => 'In Katsina city. Exact location not yet confirmed: ask locally for the National Museum (the old Katsina College).',
		'sources'    => "Wikipedia: Barewa College | https://en.wikipedia.org/wiki/Barewa_College
Wikimedia Commons: entrance of the National Museum, Katsina (photo) | https://commons.wikimedia.org/wiki/File:Keke_in_Katsina.jpg",
		'photos'     => array( 'museum-katsina-1' ),
		'captions'   => array( 'museum-katsina-1' => 'A keke (tricycle taxi) passes the entrance of the National Museum, Katsina' ),
	),
);
