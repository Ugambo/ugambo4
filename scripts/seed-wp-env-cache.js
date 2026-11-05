/**
 * Offline helper for wp-env.
 * wp-env asks wordpress.org for the latest WordPress version on every start.
 * When wordpress.org can't be reached (e.g. a restricted network), we tell
 * wp-env the version of the WordPress copy we extracted from the official
 * Docker image, so it can start without the network.
 * Usage: node scripts/seed-wp-env-cache.js <wp-version>
 */
const path = require( 'path' );
const fs = require( 'fs' );
const crypto = require( 'crypto' );
const os = require( 'os' );
// Same rule wp-env uses: WP_ENV_HOME, else ~/wp-env when Snap is present, else ~/.wp-env.
const getCacheDirectory = async () => {
	if ( process.env.WP_ENV_HOME ) return path.resolve( process.env.WP_ENV_HOME );
	return path.resolve( os.homedir(), fs.existsSync( '/snap' ) ? 'wp-env' : '.wp-env' );
};

( async () => {
	const version = process.argv[ 2 ];
	if ( ! version ) {
		console.error( 'Usage: node scripts/seed-wp-env-cache.js <wp-version>' );
		process.exit( 1 );
	}
	const configFilePath = path.resolve( __dirname, '..', '.wp-env.json' );
	const md5 = crypto.createHash( 'md5' ).update( configFilePath ).digest( 'hex' );
	const base = await getCacheDirectory();
	const dirs = [
		path.resolve( base, md5 ),
		path.resolve( base, [ 'wp-env', path.basename( path.dirname( configFilePath ) ), md5.slice( 0, 8 ) ].join( '-' ) ),
	];
	for ( const dir of dirs ) {
		fs.mkdirSync( dir, { recursive: true } );
		const file = path.join( dir, 'wp-env-cache.json' );
		let cache = {};
		try { cache = JSON.parse( fs.readFileSync( file, 'utf8' ) ); } catch ( e ) {}
		cache.latestWordPressVersion = version;
		fs.writeFileSync( file, JSON.stringify( cache ) );
	}
	console.log( `wp-env cache seeded with WordPress ${ version }` );
} )();
