function chk(t, fields){
  var g = new GlideRecord(t);
  var miss=[], have=0;
  fields.forEach(function(f){ if(g.isValidField(f)) have++; else miss.push(f); });
  gs.print(t + ': ' + have + '/' + fields.length + ' present');
  if(miss.length) gs.print('  MISSING: ' + miss.join(', '));
}
chk('pm_project',['u_project_type','u_fy_approved_budget','u_total_approved_budget']);
chk('project_change_request',['u_last_approved_budget','u_incurred_cost_to_date','u_requested_budget','u_p0_date','u_p1_date','u_p2a_date','u_p2b_date','u_p3_date','u_cumulative_revenue','u_cumulative_rd_investment','u_cumulative_adj_ebitda','u_npv','u_dpp','u_additional_approvers','u_approval_not_required','u_total_approved_budget','u_total_incurred_cost_to_date','u_total_requested_budget']);
chk('u_pm_gates',['u_number','u_gate_type','u_parent','u_phase','u_state','u_approval','u_title','u_description','u_additional_approvers','u_approval_not_required','u_fy_approved_budget','u_incurred_cost','u_remaining_cost','u_total_approved_budget','u_total_incurred_cost','u_total_remaining_cost']);
chk('u_approver_matrix',['u_project_type','u_portfolio','u_phase','u_approver','u_active']);
gs.print('');
gs.print('multi-line print test:\n  line two survived\n  line three survived');
