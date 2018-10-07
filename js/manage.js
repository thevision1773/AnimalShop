			
			function editUser(id){
				var user = $('#userid'+id)
				var fname = user.find('.fname').text();
				var lname = user.find('.lname').text();
				
				var txt = 'What would you like to change this to?'+
					'<div class="field"><label for="editfname">First Name</label><input type="text" id="editfname" name="editfname" value="'+ fname +'" /></div>'+
					'<div class="field"><label for="editlname">Last Name</label><input type="text" id="editlname" name="editlname" value="'+ lname +'" /></div>';
				
				$.prompt(txt,{ 
					buttons:{Change:true, Cancel:false},
					submit: function(e,v,m,f){
						//this is simple pre submit validation, the submit function
						//return true to proceed to the callback, or false to take 
						//no further action, the prompt will stay open.
						var flag = true;
						if (v) {
							
							if ($.trim(f.editfname) == '') {
								m.find('#editfname').addClass('error');
								flag = false;
							}
							else m.find('#editfname').removeClass('error');
							
							if ($.trim(f.editlname) == '') {
								m.find('#editlname').addClass('error');
								flag = false;
							}
							else m.find('#editlname').removeClass('error');
							
						}
						return flag;
					},
					close: function(e,v,m,f){
						
						if(v){							
							//Here is where you would do an ajax post to edit the user
							//also you might want to print out true/false from your .php
							//file and verify it has been removed before removing from the 
							//html.  if false dont remove, $promt() the error.
							
							//$.post('edituser.php',{userfname:f.editfname,userlname:f.editlname}, callback:function(data){
							//	if(data == 'true'){
							
									user.find('.fname').text(f.editfname);
									user.find('.lname').text(f.editlname);
									
							//	}else{ $.prompt('An Error Occured while editing this user'); }							
							//});
						}
						else{}
						
					}
				});
			}


			function removeUser(id){
				var txt = 'Are you sure you want to remove this user?<input type="hidden" id="userid" name="userid" value="'+ id +'" />';
				
				$.prompt(txt,{ 
					buttons:{Delete:true, Cancel:false},
					close: function(e,v,m,f){
						
						if(v){
							var uid = f.userid;
							//Here is where you would do an ajax post to remove the user
							//also you might want to print out true/false from your .php
							//file and verify it has been removed before removing from the 
							//html.  if false dont remove, $promt() the error.
							
							//$.post('removeuser.php',{userid:f.userid}, callback:function(data){
							//	if(data == 'true'){
							
									$('#userid'+uid).hide('slow', function(){ $(this).remove(); });
									
							//	}else{ $.prompt('An Error Occured while removing this user'); }							
							//});
						}
						else{}
						
					}
				});
			}