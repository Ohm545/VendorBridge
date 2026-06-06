/**
 * Procurement Quotation Controller
 * Handles viewing & comparing quotations received from vendors
 */
const pool = require('../../config/db');
const { log } = require('../../services/activityLogger');

// GET /api/procurement/quotations?rfq_id=
exports.getQuotations = async (req, res) => {
  const uid = req.user.id;
  const { rfq_id } = req.query;
  try {
    let where = 'WHERE r.created_by=$1';
    const params = [uid];
    let idx = 2;
    if (rfq_id) { where += ` AND q.rfq_id=$${idx}`; params.push(rfq_id); idx++; }

    const result = await pool.query(
      `SELECT q.*, v.vendor_name, v.company_name, v.email AS vendor_email,
         r.title AS rfq_title, r.expected_budget,
         COALESCE(q.quoted_amount, q.amount) AS final_amount
       FROM quotations q
       JOIN rfqs r ON r.id=q.rfq_id
       JOIN vendors v ON v.id=q.vendor_id
       ${where}
       ORDER BY q.submitted_at DESC`, params
    );
    return res.json({ success:true, quotations:result.rows });
  } catch(err) {
    console.error('Get quotations error:', err.message);
    return res.status(500).json({ success:false, message:'Failed to fetch quotations.' });
  }
};

// GET /api/procurement/quotations/compare/:rfq_id  — AI-powered comparison
exports.compareQuotations = async (req, res) => {
  const uid = req.user.id;
  try {
    // Verify ownership
    const rfqRes = await pool.query('SELECT * FROM rfqs WHERE id=$1 AND created_by=$2', [req.params.rfq_id, uid]);
    if (!rfqRes.rows.length) return res.status(404).json({ success:false, message:'RFQ not found.' });
    const rfq = rfqRes.rows[0];

    // All quotations for this RFQ with vendor performance data
    const quoteRes = await pool.query(
      `SELECT q.*,
         COALESCE(q.quoted_amount, q.amount) AS final_amount,
         v.vendor_name, v.company_name, v.email, v.category,
         /* Historical performance */
         (SELECT COUNT(*) FROM rfq_vendors rv WHERE rv.vendor_id=v.id) AS total_assigned,
         (SELECT COUNT(*) FROM quotations q2 WHERE q2.vendor_id=v.id) AS total_quoted,
         (SELECT COUNT(*) FROM quotations q2 WHERE q2.vendor_id=v.id AND q2.status='approved') AS total_approved,
         (SELECT COUNT(*) FROM purchase_orders po WHERE po.vendor_id=v.id) AS total_pos
       FROM quotations q
       JOIN vendors v ON v.id=q.vendor_id
       WHERE q.rfq_id=$1
       ORDER BY COALESCE(q.quoted_amount, q.amount) ASC`,
      [req.params.rfq_id]
    );

    if (!quoteRes.rows.length) {
      return res.json({ success:true, quotations:[], recommendation:null, rfq });
    }

    const quotations = quoteRes.rows;
    const minAmount = Math.min(...quotations.map(q => parseFloat(q.final_amount)));
    const minDays   = Math.min(...quotations.filter(q=>q.delivery_days).map(q=>q.delivery_days));

    // Compute scores (0-100)
    const scored = quotations.map(q => {
      const amount = parseFloat(q.final_amount) || 0;
      const days   = parseInt(q.delivery_days) || 999;
      const totalAssigned = parseInt(q.total_assigned) || 1;
      const responseRate  = totalAssigned > 0 ? Math.round((parseInt(q.total_quoted)/totalAssigned)*100) : 0;
      const approvalRate  = parseInt(q.total_quoted) > 0 ? Math.round((parseInt(q.total_approved)/parseInt(q.total_quoted))*100) : 0;

      // Price score: lowest gets 40 pts
      const priceScore  = minAmount > 0 ? Math.round((minAmount / amount) * 40) : 20;
      // Delivery score: fastest gets 30 pts
      const delivScore  = minDays > 0 && days < 999 ? Math.round((minDays / days) * 30) : 15;
      // Reliability: response rate × 0.15 + approval rate × 0.15
      const reliabScore = Math.round(responseRate * 0.15 + approvalRate * 0.15);

      const totalScore = Math.min(100, priceScore + delivScore + reliabScore);

      return {
        ...q,
        score: totalScore,
        price_score:    priceScore,
        delivery_score: delivScore,
        reliability_score: reliabScore,
        response_rate:  responseRate,
        approval_rate:  approvalRate,
        is_cheapest:    amount === minAmount,
        is_fastest:     days === minDays && days < 999,
        savings_vs_max: amount > 0 ? Math.round(((Math.max(...quotations.map(q=>parseFloat(q.final_amount))) - amount) / Math.max(...quotations.map(q=>parseFloat(q.final_amount)))) * 100) : 0,
      };
    });

    // Sort by score desc
    scored.sort((a, b) => b.score - a.score);
    const best = scored[0];

    const reasons = [];
    if (best.is_cheapest)  reasons.push('Lowest quoted price');
    if (best.is_fastest)   reasons.push(`Fastest delivery (${best.delivery_days} days)`);
    if (best.approval_rate >= 70) reasons.push(`High approval history (${best.approval_rate}%)`);
    if (best.response_rate >= 80) reasons.push(`Reliable response rate (${best.response_rate}%)`);
    if (!reasons.length)   reasons.push('Best overall composite score');

    const recommendation = {
      vendor_id:    best.vendor_id,
      vendor_name:  best.vendor_name,
      score:        best.score,
      amount:       best.final_amount,
      reasons,
    };

    return res.json({ success:true, rfq, quotations:scored, recommendation });
  } catch(err) {
    console.error('Compare quotations error:', err.message);
    return res.status(500).json({ success:false, message:'Failed to compare quotations.' });
  }
};
