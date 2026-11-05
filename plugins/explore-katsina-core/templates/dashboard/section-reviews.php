<?php
/**
 * Reviews with replies.
 *
 * @var array $b
 */
use EK\Dashboard;
use EK\Reviews;
use EK\View;

defined( 'ABSPATH' ) || exit;

$stats = Reviews::stats( $b['id'] );
$rows  = Reviews::for_business( $b['id'] );
$parts = array(
	'cleanliness' => __( 'Cleanliness', 'explore-katsina' ),
	'service'     => __( 'Service', 'explore-katsina' ),
	'value'       => __( 'Value', 'explore-katsina' ),
	'location'    => __( 'Location', 'explore-katsina' ),
);
?>
<div class="ek-stats">
	<div class="ek-stat ek-stat--accent"><small><?php esc_html_e( 'Overall rating', 'explore-katsina' ); ?></small><b><?php echo $stats['count'] ? esc_html( number_format_i18n( $stats['overall'], 1 ) ) . ' / 5' : '—'; ?></b></div>
	<div class="ek-stat"><small><?php esc_html_e( 'Verified reviews', 'explore-katsina' ); ?></small><b><?php echo (int) $stats['count']; ?></b></div>
	<div class="ek-stat"><small><?php esc_html_e( 'Replied', 'explore-katsina' ); ?></small><b><?php echo (int) $stats['replied']; ?></b></div>
	<div class="ek-stat"><small><?php esc_html_e( 'Waiting for reply', 'explore-katsina' ); ?></small><b><?php echo (int) max( 0, $stats['count'] - $stats['replied'] ); ?></b></div>
</div>
<section class="ek-card" aria-labelledby="rv-h">
	<h2 id="rv-h"><?php esc_html_e( 'Reviews', 'explore-katsina' ); ?></h2>
	<p class="ek-muted ek-small"><?php esc_html_e( 'Only guests with a completed booking or reservation can review, so every review here is verified. Reply politely: your reply is public and counts towards your response rate.', 'explore-katsina' ); ?></p>
	<?php if ( ! $rows ) : ?>
		<div class="ek-empty"><strong><?php esc_html_e( 'No reviews yet', 'explore-katsina' ); ?></strong><?php esc_html_e( 'After guests complete their stay, meal or event, they are invited to review you.', 'explore-katsina' ); ?></div>
	<?php else : ?>
		<?php foreach ( $rows as $r ) : ?>
			<article class="ek-review">
				<div class="ek-row ek-row--between">
					<div><?php echo View::stars( $r->rating_overall ); // phpcs:ignore ?> <strong><?php echo esc_html( $r->title ); ?></strong></div>
					<span class="ek-small ek-muted"><?php echo esc_html( $r->author_name ); ?> · <?php echo esc_html( View::date( $r->created_at ) ); ?></span>
				</div>
				<p class="ek-small ek-muted" style="margin:4px 0">
					<?php
					$bits = array();
					foreach ( $parts as $k => $label ) {
						$col = 'rating_' . $k;
						if ( $r->$col ) {
							$bits[] = $label . ' ' . (int) $r->$col . '/5';
						}
					}
					echo esc_html( implode( ' · ', $bits ) );
					?>
				</p>
				<p><?php echo esc_html( $r->body ); ?></p>
				<?php if ( $r->owner_reply ) : ?>
					<div class="ek-reply"><strong><?php esc_html_e( 'Your reply', 'explore-katsina' ); ?>:</strong> <?php echo esc_html( $r->owner_reply ); ?></div>
				<?php endif; ?>
				<details style="margin-top:8px">
					<summary class="ek-link-btn"><?php echo $r->owner_reply ? esc_html__( 'Edit reply', 'explore-katsina' ) : esc_html__( 'Reply', 'explore-katsina' ); ?></summary>
					<form method="post" class="ek-stack" style="margin-top:8px">
						<?php echo Dashboard::nonce_fields( 'dash_reply', $b['id'] ); // phpcs:ignore ?>
						<input type="hidden" name="review_id" value="<?php echo (int) $r->id; ?>">
						<label class="ek-visually-hidden" for="reply-<?php echo (int) $r->id; ?>"><?php esc_html_e( 'Your reply', 'explore-katsina' ); ?></label>
						<textarea id="reply-<?php echo (int) $r->id; ?>" name="reply" maxlength="2000" required><?php echo esc_textarea( (string) $r->owner_reply ); ?></textarea>
						<div><button class="ek-btn ek-btn--sm" type="submit"><?php esc_html_e( 'Publish reply', 'explore-katsina' ); ?></button></div>
					</form>
				</details>
			</article>
		<?php endforeach; ?>
	<?php endif; ?>
</section>
