			function openprompt(){
			
				var temp = {
					state0: {
						title: 'Content Rating',
						html:'<p><input type="radio" name="rate_content" id="rate_content_poor" value="Poor" class="radioinput" /> <label class="radio" for="rate_content_poor"> Poor</label></p>'+
								'<p><input type="radio" name="rate_content" id="rate_content_ok" value="Ok" class="radioinput" /> <label class="pure-radio" for="rate_content_ok"> Ok</label></p>'+
								'<p><input type="radio" name="rate_content" id="rate_content_good" value="Good" class="radioinput" />  <label class="pure-radio" for="rate_content_good">Good</label></p>'+
								'<p><input type="radio" name="rate_content" id="rate_content_excellent" value="Excellent" class="radioinput" /> <label class="pure-radio" for="rate_content_excellent"> Excellent!</label></p>',
						buttons: { Cancel: false, Next: true },
						focus: 1,
						submit:function(e,v,m,f){ 
							if(!v)
								$.prompt.close()
							else $.prompt.goToState('state1');//go forward
							return false; 
						}
					},
					state1: {
						title: 'Needs Improvement',
						html:'<p>Check all which need improvement:</p>'+
								'<p><input type="checkbox" name="rate_improve" id="rate_improve_colors" value="Color Scheme" class="radioinput" /> <label class="pure-checkbox" for="rate_improve_colors"> Color Scheme</label></p>'+
								'<p><input type="checkbox" name="rate_improve" id="rate_improve_graphics" value="Graphics" class="radioinput" /> <label class="pure-checkbox" for="rate_improve_graphics"> Graphics</label></p>'+
								'<p><input type="checkbox" name="rate_improve" id="rate_improve_readability" value="readability" class="radioinput" /> <label class="pure-checkbox" for="rate_improve_readability"> Readability</label></p>'+
								'<p><input type="checkbox" name="rate_improve" id="rate_improve_content" value="Content" class="radioinput" /> <label class="pure-checkbox" for="rate_improve_content"> Content</label></p>'+
								'<p><input type="checkbox" name="rate_improve" id="rate_improve_other" value="Other" class="radioinput" /> <label class="pure-checkbox" for="rate_improve_other"> Other</label></p>'+
								'<p><input type="text" class="pure-input-1" name="rate_improve_other_txt" id="rate_improve_other_txt" value="" placeholder="Other Description" /></p>',
						buttons: { Back: -1, Cancel: 0, Next: 1 },
						focus: 2,
						submit:function(e,v,m,f){
							if(v==0)
								$.prompt.close()
							else if(v==1)
								$.prompt.goToState('state2');//go forward
							else if(v=-1)
								$.prompt.goToState('state0');//go back
							return false; 
						}
					},
					state2: {
						title: 'How did you find this site?',
						html:'<select name="rate_find" id="rate_find"><option value="Search">Search</option><option value="Online Publication">Online Publication</option><option value="friend">A Friend</option><option value="No Clue">No Clue</option></select>',
						buttons: { Back: -1, Cancel: 0, Next: 1 },
						focus: 2,
						submit: function(e, v, m, f){
							if (v == 0) 
								$.prompt.close()
							else 
								if (v == 1) 
									$.prompt.goToState('state3');//go forward
								else 
									if (v = -1) 
										$.prompt.goToState('state1');//go back
							return false;
						}
					},
					state3: {
						title: 'Additional Comments',
						html:'<p>Please leave any other comments you have about this site:</p><div class="field"><textarea class="pure-input-1" id="rate_comments" name="rate_comments"></textarea></div>',
						buttons: { Back: -1, Cancel: 0, Finish: 1 },
						focus: 2,
						submit:function(e,v,m,f){ 
							if(v==0) 
								$.prompt.close()
							else if(v==1)								
								return true; //we're done
							else if(v=-1)
								$.prompt.goToState('state2');//go back
							return false; 
						}
					}
				}
				
				$.prompt(temp,{
					close: function(e,v,m,f){
						if(v !== undefined){
							var str = "You can now process with this given information:<br />";
							$.each(f,function(i,obj){
								str += i + " - <em>" + obj + "</em><br />";
							});	
							$('#results').html(str);
						}
					},
					classes: {
						box: '',
						fade: '',
						prompt: '',
						close: '',
						title: 'lead',
						message: 'pure-form',
						buttons: '',
						button: 'pure-button',
						defaultButton: 'pure-button-primary'
					}
				});
			}
