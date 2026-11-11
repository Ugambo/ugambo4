<?php
/**
 * SAMPLE data for demonstrations (Phase 13). Every name starts with "SAMPLE" and every business is
 * invented: no real business names, phone numbers or addresses. Phone: the placeholder
 * +234 800 000 0000. Pins: within ~1.5 km of real town centres (OpenStreetMap), so the map looks real.
 * Delete everything with `wp ek delete-sample --yes`.
 *
 * Prices in naira (realistic for Katsina State, placeholders).
 *
 * @package ExploreKatsina
 */

defined( 'ABSPATH' ) || exit;

return array(
	// Town centres (OpenStreetMap), LGA names as in Install::lgas().
	'towns'       => array(
		'katsina'    => array( 'Katsina', 12.9894, 7.6006 ),
		'daura'      => array( 'Daura', 13.0359, 8.3194 ),
		'funtua'     => array( 'Funtua', 11.5232, 7.3075 ),
		'malumfashi' => array( 'Malumfashi', 11.7853, 7.6218 ),
		'dutsinma'   => array( 'Dutsin-Ma', 12.4384, 7.5061 ),
		'mani'       => array( 'Mani', 12.8433, 7.8883 ),
		'jibia'      => array( 'Jibia', 13.0948, 7.2244 ),
	),

	'hotels'      => array(
		array( 'Crimson Gate Hotel', 'katsina', 4, 'moderate', array( 'wifi', 'parking', 'power', 'ac', 'pool', 'restaurant', 'room_service', 'conference', 'prayer', 'security' ), array(
			array( 'Standard Room', 18000, 22000, 10, 2, 'double', 20 ),
			array( 'Deluxe Room', 28000, 32000, 8, 2, 'queen', 26 ),
			array( 'Executive Room', 45000, 50000, 5, 2, 'king', 32 ),
			array( 'Royal Suite', 85000, 95000, 2, 4, 'king', 55 ),
		) ),
		array( 'Brass Lantern Guest House', 'katsina', 2, 'flexible', array( 'wifi', 'parking', 'power', 'ac', 'prayer', 'security' ), array(
			array( 'Single Room', 12000, 12000, 6, 1, 'single', 14 ),
			array( 'Double Room', 16000, 18000, 6, 2, 'double', 18 ),
			array( 'Family Room', 25000, 27000, 3, 4, 'family', 28 ),
		) ),
		array( 'Emerald Court Hotel', 'katsina', 4, 'strict', array( 'wifi', 'parking', 'power', 'ac', 'gym', 'restaurant', 'lounge', 'airport', 'laundry', 'security', 'accessible' ), array(
			array( 'Classic Room', 22000, 25000, 12, 2, 'double', 22 ),
			array( 'Superior Room', 32000, 36000, 8, 2, 'queen', 26 ),
			array( 'Business Room', 50000, 50000, 6, 2, 'king', 30 ),
			array( 'Presidential Suite', 95000, 110000, 1, 4, 'king', 70 ),
		) ),
		array( 'Indigo House', 'daura', 3, 'moderate', array( 'wifi', 'parking', 'power', 'ac', 'restaurant', 'prayer' ), array(
			array( 'Standard Room', 14000, 15000, 8, 2, 'double', 18 ),
			array( 'Twin Room', 20000, 22000, 4, 2, 'twin', 22 ),
			array( 'Family Suite', 30000, 33000, 2, 5, 'family', 36 ),
		) ),
		array( 'Savanna Rest Inn', 'daura', 2, 'flexible', array( 'parking', 'power', 'ac', 'security' ), array(
			array( 'Economy Room', 10000, 10000, 8, 1, 'single', 12 ),
			array( 'Standard Room', 15000, 16000, 6, 2, 'double', 16 ),
			array( 'Twin Room', 22000, 22000, 3, 2, 'twin', 20 ),
		) ),
		array( 'Horizon Hotel Funtua', 'funtua', 3, 'moderate', array( 'wifi', 'parking', 'power', 'ac', 'restaurant', 'conference', 'laundry' ), array(
			array( 'Standard Room', 15000, 17000, 10, 2, 'double', 18 ),
			array( 'Deluxe Room', 22000, 25000, 8, 2, 'queen', 24 ),
			array( 'Executive Room', 35000, 38000, 4, 2, 'king', 30 ),
			array( 'Suite', 60000, 65000, 2, 4, 'king', 48 ),
		) ),
		array( 'Palmview Lodge', 'malumfashi', 2, 'non_refundable', array( 'parking', 'power', 'ac', 'prayer' ), array(
			array( 'Single Room', 9000, 9000, 6, 1, 'single', 12 ),
			array( 'Double Room', 13000, 14000, 6, 2, 'double', 16 ),
			array( 'Family Room', 20000, 20000, 2, 4, 'family', 26 ),
		) ),
		array( 'Lakeside Lodge Dutsin-Ma', 'dutsinma', 3, 'moderate', array( 'wifi', 'parking', 'power', 'ac', 'restaurant', 'family' ), array(
			array( 'Garden Room', 16000, 18000, 8, 2, 'double', 20 ),
			array( 'Lake View Room', 24000, 27000, 6, 2, 'queen', 24 ),
			array( 'Family Chalet', 38000, 42000, 3, 5, 'family', 40 ),
		) ),
	),

	// name, town, cuisines, price level, menu: category => [ [item, naira, description], … ]
	'restaurants' => array(
		array( 'Suya Corner', 'katsina', array( 'grills', 'hausa' ), 1, array(
			'Grills'  => array( array( 'Beef suya (per stick)', 1000, 'Spiced with yaji, onions and tomato' ), array( 'Chicken suya', 2500, '' ), array( 'Kilishi (100 g)', 3000, 'Dried spiced beef' ), array( 'Ram suya (plate)', 4500, '' ) ),
			'Sides'   => array( array( 'Masa (3 pieces)', 600, 'Rice cakes' ), array( 'Fried yam', 1200, '' ), array( 'Plantain (dodo)', 1000, '' ) ),
			'Drinks'  => array( array( 'Zobo', 500, 'Hibiscus drink' ), array( 'Kunun aya', 700, 'Tiger nut drink' ), array( 'Bottled water', 300, '' ) ),
		) ),
		array( 'Mama Tuwo Kitchen', 'katsina', array( 'hausa' ), 1, array(
			'Swallow & soups' => array( array( 'Tuwo shinkafa with miyan kuka', 1500, '' ), array( 'Tuwo masara with miyan taushe', 1500, 'Pumpkin soup' ), array( 'Tuwo with miyan agushi', 1800, '' ) ),
			'Breakfast'       => array( array( 'Kosai and koko', 800, 'Bean cakes with millet pap' ), array( 'Masa with miyan taushe', 1200, '' ) ),
			'Drinks'          => array( array( 'Fura da nono', 800, 'Millet balls with fresh milk' ), array( 'Zobo', 500, '' ) ),
		) ),
		array( 'Jollof Junction', 'katsina', array( 'nigerian' ), 2, array(
			'Rice'    => array( array( 'Jollof rice with chicken', 3500, '' ), array( 'Fried rice with turkey', 4500, '' ), array( 'White rice and stew', 3000, '' ) ),
			'Soups'   => array( array( 'Pepper soup (goat)', 4000, '' ), array( 'Egusi with pounded yam', 4500, '' ) ),
			'Extras'  => array( array( 'Moi moi', 800, '' ), array( 'Coleslaw', 600, '' ), array( 'Plantain', 1000, '' ) ),
			'Drinks'  => array( array( 'Chapman', 1500, '' ), array( 'Soft drink', 500, '' ) ),
		) ),
		array( 'Garden Terrace Restaurant', 'katsina', array( 'continental', 'nigerian' ), 3, array(
			'Starters' => array( array( 'Pepper soup (catfish)', 5000, '' ), array( 'Chicken wings', 4500, '' ) ),
			'Mains'    => array( array( 'Grilled tilapia with chips', 9500, '' ), array( 'Chicken shawarma platter', 7000, '' ), array( 'Steak with vegetables', 12000, '' ), array( 'Spaghetti bolognese', 6500, '' ) ),
			'Desserts' => array( array( 'Fruit salad', 3000, '' ), array( 'Ice cream (2 scoops)', 2500, '' ) ),
			'Drinks'   => array( array( 'Fresh orange juice', 2000, '' ), array( 'Smoothie', 3000, '' ) ),
		) ),
		array( 'Daura Tea & Grill', 'daura', array( 'grills', 'drinks' ), 1, array(
			'Tea & breakfast' => array( array( 'Shayi (spiced tea)', 300, '' ), array( 'Bread and egg', 900, '' ), array( 'Indomie with egg', 1200, '' ) ),
			'Grills'          => array( array( 'Beef suya (plate)', 2500, '' ), array( 'Grilled chicken', 3500, '' ) ),
		) ),
		array( 'Funtua Food Court', 'funtua', array( 'nigerian', 'fast_food' ), 2, array(
			'Meals'  => array( array( 'Jollof rice with chicken', 3000, '' ), array( 'Beans and plantain', 1800, '' ), array( 'Yam porridge', 2000, '' ) ),
			'Snacks' => array( array( 'Meat pie', 800, '' ), array( 'Chicken burger', 3000, '' ), array( 'Shawarma', 2500, '' ) ),
			'Drinks' => array( array( 'Zobo', 500, '' ), array( 'Soft drink', 500, '' ) ),
		) ),
		array( 'Malumfashi Kitchen', 'malumfashi', array( 'hausa', 'nigerian' ), 1, array(
			'Meals'  => array( array( 'Tuwo shinkafa with miyan kuka', 1200, '' ), array( 'Rice and beans (dafa duka)', 1500, '' ), array( 'Jollof rice with fish', 2500, '' ) ),
			'Drinks' => array( array( 'Fura da nono', 700, '' ), array( 'Kunun zaki', 500, '' ) ),
		) ),
		array( 'Mani Road Eatery', 'mani', array( 'nigerian', 'hausa' ), 1, array(
			'Meals'  => array( array( 'Rice and stew with beef', 2000, '' ), array( 'Spaghetti jollof', 1800, '' ), array( 'Tuwo with miyan taushe', 1300, '' ) ),
			'Drinks' => array( array( 'Bottled water', 300, '' ), array( 'Zobo', 500, '' ) ),
		) ),
	),

	// name, town, booking mode, policy, amenities, halls: [ name, naira, weekend naira, seated, standing, setting ]
	'venues'      => array(
		array( 'Grand Durbar Hall', 'katsina', 'request', 'moderate', array( 'parking', 'power', 'ac', 'chairs', 'sound', 'stage', 'security', 'changing', 'accessible' ), array(
			array( 'Main Hall', 850000, 1000000, 1200, 1800, 'indoor' ),
			array( 'Banquet Room', 250000, 300000, 300, 450, 'indoor' ),
		) ),
		array( 'Royal Garden Events', 'katsina', 'instant', 'strict', array( 'parking', 'power', 'chairs', 'catering', 'decoration', 'security' ), array(
			array( 'Garden Lawn', 400000, 480000, 600, 900, 'outdoor' ),
		) ),
		array( 'Unity Event Centre', 'daura', 'request', 'moderate', array( 'parking', 'power', 'ac', 'chairs', 'sound' ), array(
			array( 'Unity Hall', 300000, 350000, 600, 800, 'indoor' ),
		) ),
		array( 'Crown Hall Funtua', 'funtua', 'instant', 'flexible', array( 'parking', 'power', 'ac', 'chairs', 'stage', 'projector' ), array(
			array( 'Crown Hall', 280000, 320000, 500, 700, 'indoor' ),
			array( 'Meeting Room', 60000, 60000, 60, 80, 'indoor' ),
		) ),
		array( 'Emerald Banquet Centre', 'katsina', 'request', 'moderate', array( 'parking', 'power', 'ac', 'chairs', 'sound', 'catering', 'decoration', 'security' ), array(
			array( 'Emerald Hall', 550000, 650000, 800, 1100, 'indoor' ),
			array( 'Courtyard', 200000, 240000, 250, 400, 'outdoor' ),
		) ),
	),

	// Directory categories: 3 each. name, town, short description.
	'others'      => array(
		'tour-operator' => array( array( 'Heritage Walks Katsina', 'katsina', 'Guided walks in the old city.' ), array( 'Savanna Trails', 'katsina', 'Day trips around Katsina State.' ), array( 'Daura Day Trips', 'daura', 'Visits to Daura with a local guide.' ) ),
		'transport'     => array( array( 'City Keke & Taxi', 'katsina', 'Keke and taxi bookings in Katsina city.' ), array( 'Northern Car Hire', 'katsina', 'Cars with drivers for day trips.' ), array( 'Funtua Express Bus', 'funtua', 'Buses between Funtua and Katsina.' ) ),
		'crafts'        => array( array( 'Indigo Dye Workshop', 'katsina', 'Hand-dyed fabrics.' ), array( 'Leather Craft House', 'katsina', 'Bags, sandals and pouffes.' ), array( 'Cap Weavers Daura', 'daura', 'Hand-woven caps.' ) ),
		'shopping'      => array( array( 'Central Shopping Plaza', 'katsina', 'Shops and supermarket.' ), array( 'Fabric Corner', 'daura', 'Fabrics and tailoring.' ), array( 'Souvenir Stall', 'funtua', 'Gifts and souvenirs.' ) ),
		'health'        => array( array( 'City Pharmacy', 'katsina', 'Pharmacy.' ), array( 'Family Clinic', 'funtua', 'General clinic.' ), array( 'Day & Night Chemist', 'daura', 'Pharmacy.' ) ),
		'banks'         => array( array( 'Bank ATM Kofar Kaura', 'katsina', 'Cash machine.' ), array( 'Bank Branch Daura', 'daura', 'Bank branch with cash machine.' ), array( 'Bank ATM Funtua', 'funtua', 'Cash machine.' ) ),
	),

	// SAMPLE guests (invented names) for bookings and reviews.
	'guests'      => array( 'Aisha Bello', 'Musa Ibrahim', 'Fatima Sani', 'Yusuf Abdullahi', 'Hauwa Usman', 'Ibrahim Lawal', 'Zainab Garba', 'Sani Mohammed', 'Amina Yakubu', 'Chinedu Okafor', 'Grace Adeyemi', 'Tunde Bakare' ),

	// Review texts by star rating (SAMPLE, written for these invented places).
	'reviews'     => array(
		5 => array( array( 'Excellent stay', 'Clean rooms, friendly staff and steady power all night. Would come back.' ), array( 'Highly recommended', 'Everything was as described. The staff helped us plan our visit to the old city.' ), array( 'Wonderful', 'Great food and very welcoming. Booking online was easy.' ) ),
		4 => array( array( 'Very good', 'Comfortable and good value. Breakfast could have more choice.' ), array( 'Good experience', 'Nice place, quick check-in. A little noisy in the evening.' ) ),
		3 => array( array( 'Okay', 'Fine for one night. Some things need repair, but the staff were polite.' ) ),
		2 => array( array( 'Below expectations', 'The room was not ready when we arrived and the air conditioning was weak.' ) ),
	),

	'tours'       => array(
		array( 'Old City Walking Tour', 15000, 12, '3 hours', 'SAMPLE pickup point: Kofar Soro, Katsina', "Local guide\nBottled water", 'katsina', '09:00' ),
		array( 'Daura Day Trip', 45000, 8, 'Full day (8 hours)', 'SAMPLE pickup point: your hotel in Katsina city', "Transport by car\nLocal guide\nLunch\nBottled water", 'daura', '07:30' ),
	),

	'products'    => array(
		array( 'Leather pouffe', 25000, 'leatherwork', 5 ),
		array( 'Leather sandals', 9500, 'leatherwork', 10 ),
		array( 'Indigo-dyed fabric (2 yards)', 12000, 'fabrics', 8 ),
		array( 'Hand-woven cap', 8000, 'crafts', 12 ),
		array( 'Decorated calabash bowl', 6000, 'crafts', 6 ),
	),
);
