			function openLoanCalculatorPrompt(o){
				o = jQuery.extend({},{ amount:100000, down: 1500, years:15, rate:5 },o);
				
				var formstr = '<div class="field"><label for="intamount">Amount</label><input type="text" name="intamount" id="intamount" value="'+ o.amount +'" /></div>'+
					'<div class="field"><label for="intdown">Down Payment</label><input type="text" name="intdown" id="intdown" value="'+ o.down +'" /></div>'+
					'<div class="field"><label for="intyears">Years</label><input type="text" name="intyears" id="intyears" value="'+ o.years +'" /></div>'+
					'<div class="field"><label for="intrate">Rate</label><input type="text" name="intrate" id="intrate" value="'+ o.rate +'" /></div>';
					
				jqistates = {
					state0: {
						title: 'Calculate Monthly Payment',
						html: formstr,
						focus: 1,
						buttons: { Cancel: false, Calculate: true },
						submit: function(e, v, m, f){
							var e = "";
							m.find('.errorBlock').hide('fast',function(){ jQuery(this).remove(); });
							
							if (v) {
								
								if(isNaN(f.intamount))
									e += "Please enter a numeric amount (No commas)<br />";
									
								if(isNaN(f.intdown))
									e += "Please enter a numeric down payment (No commas)<br />";
									
								if(isNaN(f.intyears))
									e += "Please enter a numeric number of years<br />";
									
								if(isNaN(f.intrate))
									e += "Please enter a numeric interest rate<br />";
								
								if (e == "") {
																	
									var interest = f.intrate/100;
									var years = f.intyears;
									var amount = f.intamount-f.intdown;
									var n = years * 12;
									
									if(f.intrate == 0){
										var m = amount / n;
									}
									else{
										var i = interest / 12;
										var i_to_n = Math.pow((i + 1), n);
									
										var p = amount * ((i * i_to_n) / (i_to_n - 1));
										var m = Math.round(p * 100) / 100;
									}
																		
									jQuery.prompt.getState('state1').find('#intmonthlypayment').text(m);									
									jQuery.prompt.goToState('state1',true);
									
								}
								else{
									jQuery('<div class="errorBlock" style="display: none;">'+ e +'</div>').prependTo(m).show('slow');
								}
								return false;
							}
							else return true;
						}
					},
					state1: {
						html: 'Monthly Payment: $<span id="intmonthlypayment"></span>',
						focus: 1,
						buttons: { Back: false, Done: true },
						submit: function(e,v,m,f){
							if(v)
								return true;
								
							jQuery.prompt.goToState('state0');
							return false;
						}
					}
				};
				
				$.prompt(jqistates);
			}