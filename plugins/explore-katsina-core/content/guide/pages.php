<?php
/**
 * "Plan your trip" pages (Phase 10). Imported by `wp ek import-guide`. The first page is the parent;
 * the rest are its children. Links: {{page:slug}}, {{attraction:slug}}, {{event:slug}},
 * {{site:key}} (pages created by the plugin, e.g. map, hotels, tours).
 *
 * We do not state which areas are safe, emergency phone numbers, flight times or fares: these
 * change, and we could not verify them. The Safety page sends visitors to official advisories.
 *
 * @package ExploreKatsina
 */

defined( 'ABSPATH' ) || exit;

$note = '<p class="ek-guide-note">Things change: check transport, opening times and travel advice before you go. Spotted something out of date? Tell us at <a href="mailto:info@explorekatsina.com.ng">info@explorekatsina.com.ng</a>.</p>';

return array(

	array(
		'title'   => 'Plan your trip',
		'slug'    => 'plan-your-trip',
		'excerpt' => 'Everything you need to plan a visit to Katsina State.',
		'content' => '<p>Katsina State, in the far north of Nigeria on the border with Niger, is one of the historic heartlands of the Hausa people. It is home to the old walled city of Katsina, the Gobarau Minaret and Daura, the town at the centre of the Bayajidda legend.</p>
<h2>Start here</h2>
<ul>
<li><a href="{{page:getting-there}}"><strong>Getting there</strong></a>: by air to Katsina, or by road from Kano and elsewhere.</li>
<li><a href="{{page:getting-around}}"><strong>Getting around</strong></a>: keke, taxis and day trips.</li>
<li><a href="{{page:etiquette-and-dress}}"><strong>Etiquette and dress</strong></a>: local customs, greetings and what to wear.</li>
<li><a href="{{page:best-time-to-visit}}"><strong>Best time to visit</strong></a>: seasons, weather and festivals.</li>
<li><a href="{{page:itineraries}}"><strong>Itineraries</strong></a>: ideas for one day and three days.</li>
<li><a href="{{page:safety-and-travel-tips}}"><strong>Safety and travel tips</strong></a>: official travel advice and practical tips.</li>
</ul>
<h2>Find what you need</h2>
<p><a href="{{site:things_to_do}}">Things to do</a> · <a href="{{site:hotels}}">Hotels</a> · <a href="{{site:restaurants}}">Restaurants</a> · <a href="{{site:events}}">Events</a> · <a href="{{site:tours}}">Tours</a> · <a href="{{site:map}}">Katsina Map</a></p>
' . $note,
	),

	array(
		'title'   => 'Getting there',
		'slug'    => 'getting-there',
		'excerpt' => 'Flying to Katsina, or travelling by road from Kano and the rest of Nigeria.',
		'content' => '<h2>By air</h2>
<p><strong>Umaru Musa Yar\'Adua Airport, Katsina</strong> (airport code DKA) is about 6–7 km north-east of the city centre (straight line). It has domestic flights, mainly to and from Abuja and Lagos. Airlines, routes and schedules change often, so check directly with the airlines before you plan.</p>
<p>Many international visitors fly into Abuja or Kano and continue to Katsina by a connecting flight or by road.</p>
<h2>By road</h2>
<ul>
<li><strong>From Kano:</strong> about 150 km on the Kano–Katsina highway (A9).</li>
<li><strong>From Abuja and the south:</strong> ask your transport company for the current recommended route.</li>
<li><strong>Buses and shared taxis</strong> run between Katsina and other cities. Ask at your hotel or at a motor park for current departures and fares.</li>
</ul>
<p>Plan road journeys for daylight hours, and read our <a href="{{page:safety-and-travel-tips}}">safety and travel tips</a> before you travel.</p>
<h2>Entry to Nigeria</h2>
<p>If you are visiting from abroad, check visa and health requirements with the Nigerian embassy or high commission in your country, and with your own government\'s travel advice, well before you travel.</p>
' . $note,
	),

	array(
		'title'   => 'Getting around',
		'slug'    => 'getting-around',
		'excerpt' => 'Keke, taxis, hired cars and distances to the main sights.',
		'content' => '<h2>In Katsina city</h2>
<p><strong>Keke</strong> (tricycle taxis) are a common way to get around the city. Agree the fare before you set off. Small notes and coins in naira are useful.</p>
<p>Many sights in the old city are close together. The <a href="{{attraction:gobarau-minaret}}">Gobarau Minaret</a> and the <a href="{{attraction:emir-of-katsina-palace}}">Emir\'s palace</a> are about 600 m apart (straight line).</p>
<h2>Day trips</h2>
<p>For places outside the city, such as Daura, Zobe Dam or Durbi Takusheyi, hire a car with a driver through your hotel or join a <a href="{{site:tours}}">tour</a>.</p>
<h2>Distances from Katsina city</h2>
<table>
<thead><tr><th>Place</th><th>Distance</th></tr></thead>
<tbody>
<tr><td><a href="{{attraction:ajiwa-dam}}">Ajiwa Dam</a></td><td>about 18 km east-south-east (straight line)</td></tr>
<tr><td><a href="{{attraction:durbi-takusheyi}}">Durbi Takusheyi</a></td><td>about 30 km east (straight line)</td></tr>
<tr><td><a href="{{attraction:zobe-dam}}">Zobe Dam</a> (Dutsin-Ma)</td><td>about 70 km south (straight line)</td></tr>
<tr><td>Daura (<a href="{{attraction:kusugu-well-daura}}">Kusugu Well</a>, <a href="{{attraction:emir-of-daura-palace}}">Emir\'s Palace</a>)</td><td>about 80 km by road, east</td></tr>
<tr><td>Kano</td><td>about 150 km by road, south-east</td></tr>
</tbody>
</table>
<p>Road distances are longer than straight-line distances. Travel times depend on the road and the traffic, so ask your hotel or driver.</p>
<p>See everything on the <a href="{{site:map}}">Katsina Map</a>.</p>
' . $note,
	),

	array(
		'title'   => 'Etiquette and dress',
		'slug'    => 'etiquette-and-dress',
		'excerpt' => 'Local customs, greetings, dress and photography.',
		'content' => '<p>Katsina State is mainly Muslim, and Sharia law applies in the state. A little respect for local customs goes a long way.</p>
<h2>What to wear</h2>
<ul>
<li>Dress modestly: loose clothes that cover the shoulders and knees, for both men and women.</li>
<li>Women may want to carry a scarf to cover their hair, especially at religious sites and palaces.</li>
<li>Take your shoes off before entering a mosque. Non-Muslims should ask permission before going in.</li>
</ul>
<h2>Greetings</h2>
<p>Greetings matter in Hausa culture. Take a moment to greet people before asking for something. A few Hausa words help:</p>
<ul>
<li><strong>Sannu</strong>: hello</li>
<li><strong>Ina kwana?</strong>: good morning (literally, "how did you sleep?")</li>
<li><strong>Na gode</strong>: thank you</li>
</ul>
<h2>Good to know</h2>
<ul>
<li>Use your right hand to give, receive and eat.</li>
<li>Some people, especially women, may not want to shake hands with someone of the opposite sex. Wait for the other person to offer a hand.</li>
<li>Always ask before photographing people. Do not photograph military, police or government buildings, and ask before photographing palaces.</li>
<li>Friday midday prayers are important: some businesses close or slow down around them.</li>
<li>During Ramadan, avoid eating, drinking or smoking in public during daylight hours.</li>
<li>Alcohol is not part of local culture and may be restricted: do not drink in public.</li>
</ul>
' . $note,
	),

	array(
		'title'   => 'Best time to visit',
		'slug'    => 'best-time-to-visit',
		'excerpt' => 'Seasons, weather and festivals in Katsina State.',
		'content' => '<p>Katsina has a hot, semi-arid climate with a long dry season and a short rainy season. The months below are approximate and vary from year to year.</p>
<h2>The seasons</h2>
<ul>
<li><strong>Cool, dry season (roughly November to February):</strong> the most comfortable time for sightseeing. The Harmattan wind from the Sahara brings dust and hazy skies, with cool nights and mornings. Bring a light jacket, and lip balm and eye drops for the dry air.</li>
<li><strong>Hot season (roughly March to May):</strong> the hottest time of year. Sightsee early in the morning and late in the afternoon, and drink plenty of water.</li>
<li><strong>Rainy season (roughly June to September):</strong> greener countryside and slightly cooler days. Heavy storms can make some roads difficult.</li>
</ul>
<h2>Festivals</h2>
<p>The <a href="{{event:sallah-durbar-katsina}}">Sallah Durbar</a> takes place at Eid al-Fitr (after Ramadan) and Eid al-Adha. The dates follow the Islamic calendar, so they move about 11 days earlier each year. See <a href="{{site:events}}">Events</a> for dates once they are announced.</p>
' . $note,
	),

	array(
		'title'   => 'Itineraries',
		'slug'    => 'itineraries',
		'excerpt' => 'Suggested plans for one day and three days in Katsina State.',
		'content' => '<p>These plans are suggestions only. Opening times and access to some places are not yet confirmed, so check locally the day before, and see our <a href="{{page:safety-and-travel-tips}}">safety and travel tips</a> before you travel outside the city.</p>
<h2>One day in Katsina city</h2>
<ul>
<li><strong>Morning:</strong> start at <a href="{{attraction:katsina-central-market}}">Katsina Central Market</a> while it is cool and busy. Look out for cloth, leather and other crafts.</li>
<li><strong>Late morning:</strong> go to the <a href="{{attraction:gobarau-minaret}}">Gobarau Minaret</a>, then walk to the <a href="{{attraction:emir-of-katsina-palace}}">Emir\'s palace</a> and its main gate, Kofar Soro (about 600 m).</li>
<li><strong>Lunch:</strong> find a place to eat on our <a href="{{site:restaurants}}">restaurants</a> page.</li>
<li><strong>Afternoon:</strong> take a keke around the old <a href="{{attraction:katsina-city-walls-and-gates}}">city gates</a>: Kofar Guga in the west, Kofar Sauri in the north-east, Kofar Durbi in the east and Kofar Kaura in the south. If it is open, visit the <a href="{{attraction:national-museum-katsina}}">National Museum</a>.</li>
</ul>
<h2>Three days in Katsina State</h2>
<ul>
<li><strong>Day 1, Katsina city:</strong> follow the one-day plan above.</li>
<li><strong>Day 2, Daura:</strong> a day trip of about 80 km each way by road. Visit <a href="{{attraction:kusugu-well-daura}}">Kusugu Well</a>, the well of the Bayajidda legend, and see the <a href="{{attraction:emir-of-daura-palace}}">Emir of Daura\'s Palace</a>.</li>
<li><strong>Day 3, around Katsina:</strong> choose either the east, with <a href="{{attraction:ajiwa-dam}}">Ajiwa Dam</a> and the burial mounds of <a href="{{attraction:durbi-takusheyi}}">Durbi Takusheyi</a>, or the south, with <a href="{{attraction:zobe-dam}}">Zobe Dam</a> near Dutsin-Ma. Ask locally about access first.</li>
</ul>
<p>Where to stay: see <a href="{{site:hotels}}">hotels</a>, or every attraction page, which lists the nearest hotels, restaurants and event centres. Prefer a guide? See our <a href="{{site:tours}}">tours</a>.</p>
' . $note,
	),

	array(
		'title'   => 'Safety and travel tips',
		'slug'    => 'safety-and-travel-tips',
		'excerpt' => 'Check official travel advice before you go, plus practical tips.',
		'content' => '<h2>Check official travel advice first</h2>
<p>Security conditions in parts of Nigeria can change quickly. <strong>Explore Katsina does not say which areas are safe or unsafe.</strong> Before you book and again before you travel, read the latest official advice:</p>
<ul>
<li><a href="https://www.gov.uk/foreign-travel-advice/nigeria" rel="noopener" target="_blank">UK Foreign, Commonwealth &amp; Development Office: Nigeria travel advice</a></li>
<li><a href="https://travel.state.gov/content/travel/en/traveladvisories/traveladvisories/nigeria-travel-advisory.html" rel="noopener" target="_blank">US Department of State: Nigeria travel advisory</a></li>
<li><a href="https://travel.gc.ca/destinations/nigeria" rel="noopener" target="_blank">Government of Canada: Travel advice for Nigeria</a></li>
<li><a href="https://www.smartraveller.gov.au/destinations/africa/nigeria" rel="noopener" target="_blank">Australian Government Smartraveller: Nigeria</a></li>
</ul>
<p>If you live in Nigeria, follow announcements from the Katsina State Government and local news. Your travel insurance may not cover areas where your government advises against travel.</p>
<h2>Practical tips</h2>
<ul>
<li>Plan road journeys for daylight hours, and tell someone your plans.</li>
<li>Ask your hotel for local emergency contacts when you arrive.</li>
<li>Carry a copy of your passport or ID, and keep the original safe.</li>
<li>Get travel health advice before you go, including about vaccinations and malaria.</li>
<li>Drink bottled or treated water, especially in the hot season, and protect yourself from the sun.</li>
<li>Carry some cash in naira for keke fares and markets, and keep it out of sight.</li>
<li>Book through Explore Katsina: the payment is protected, and you can report a problem from your booking page.</li>
</ul>
' . $note,
	),
);
