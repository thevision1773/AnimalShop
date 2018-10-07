$(window).on("load",function(){
	"use strict";



    /*=== Modal Box Initialization ===*/
     $('.modal').modal({
        inDuration:600
     });
     $('select').material_select();

    /*=== Tabs Fade Effect ===*/
    $(".tabs .tab a").on("click",function(){
        var tab_id = $(this).attr("href");
        tab_id = tab_id.replace('#', '');
        $("body").find('#' + tab_id).fadeIn(1000);
    });


    /*=== Topbar Notification & Launcher Button ===*/
    $(".click-btn").on("click",function(){
    	$(this).next("div").toggleClass("active");
    	$(this).parent().siblings().find(".click-btn").next("div").removeClass("active");
    	return false;
    });
    $('html').on("click",function(){
    	$(".notification-dropdown").removeClass("active");
    	$(".launcher-dropdown").removeClass("active");
    });
    $(".click-btn, .notification-dropdown, .launcher-dropdown").on("click",function(e){
    	e.stopPropagation();
    });


    /*=== Widgets Main Functions ===*/    
    $(".fl-scr").on("click",function(){
        $(this).closest('.widget').toggleClass('expand');
    });

    $(".rmv").on("click",function(){
        $(this).closest('.widget').fadeOut();
        setTimeout(function(){
            $(".masonary").isotope('reloadItems').isotope({ sortBy:'original-order' });
        },400)
        return false;
    });

    $('.loader').each(function(){
        $(this).append('<div class="preloader-wrapper small active"> <div class="spinner-layer spinner-blue-only"> <div class="circle-clipper left"> <div class="circle"></div> </div><div class="gap-patch"> <div class="circle"></div> </div><div class="circle-clipper right"> <div class="circle"></div> </div> </div> </div> ');
    });

    $(".rld").on("click",function(){
        $(this).closest('.widget').addClass('loading').find('.loader').addClass('active').delay(3000).queue(function(next){
            $(this).closest('.widget').removeClass('loading').find('.loader').removeClass('active')
            next();
        });
    });



    /*=== Contacts Add, Delete and Edit Functions ===*/
    // Required Info on Modal
    function editContact(){
        $(".contact-info").on("click",function(){
            var name = $(this).find(".cnt-name").html();
            var mail = $(this).find(".mail-id").html();
            var phone = $(this).attr('data-number');
            var img = $(this).find(".info-img img").attr('src');
            $(".modal .contact-body").find("#full_name").val(name);
            $(".modal .contact-body").find("#email_id").val(mail);
            $(".modal .contact-body").find("#phone_number").val(phone);
            $(".modal .contact-header").find(".contact-name").html(name);
            $(".modal .contact-header").find(".contact-img img").attr('src', img);

            $(this).parent().addClass('focused');
            $(this).parent().siblings().removeClass('focused');

            $(".modal .contact-body").removeClass('adding-contact');
        });
    }

    editContact();

    // Delete Contact
    $(".delete-contact").on('click',function(){
        $(".contacts-list").find('.focused').remove();
        Materialize.toast('Your have successfully deleted a contact!', 4000);
    });

    // Save Edition in Contact
    $(".save-contact").on('click',function(){
        var name = $("#full_name").val();
        var mail = $("#email_id").val();
        var phone = $("#phone_number").val();
        var img  = $(".modal .contact-header").find(".contact-img img").attr('src');

        $(".contacts-list").find('.focused').find(".cnt-name").html(name);
        $(".contacts-list").find('.focused').find(".mail-id").html(mail);
        $(".contacts-list").find('.focused').find(".contact-info").attr('data-number', phone);
        $(".contacts-list").find('.focused').find(".info-img img").attr('src', img);

        Materialize.toast('Your changes have been saved!', 4000);

    });

    // Image Preview
    $('#file-input').change( function(event) {
        var tmppath = URL.createObjectURL(event.target.files[0]);
        $(".contact-img img").fadeIn("fast").attr('src',URL.createObjectURL(event.target.files[0]));
    });


    // Add A New Contact
    function addNew(){
        $(".add-new-contact").on('click',function(){
            var name = $("#full_name").val();
            var mail = $("#email_id").val();
            var phone = $("#phone_number").val();
            var img  = $(".modal .contact-header").find(".contact-img img").attr('src');

            $(".contacts-list").append("<li> <a href='#contactEditUser' title='' class='contact-info' data-number='" + phone + "'> <span class='info-img'><img src='" + img + "' alt=''></span> <span class='info-detail'><i class='cnt-name'>" + name +"</i><i class='mail-id'>" + mail + "</i></span> </a> </li> ")
            editContact();
            Materialize.toast('Your have successfully add a new contact!', 4000);

        });
    }


    $(".add-contact").on("click",function(){
        $(".modal .contact-body").find("#full_name").val("");
        $(".modal .contact-body").find("#email_id").val("");
        $(".modal .contact-body").find("#phone_number").val("");
        $(".modal .contact-header").find(".contact-name").html("");
        $(".modal .contact-header").find(".contact-img img").attr('src', "");

        $(".modal .contact-body").addClass('adding-contact');
        addNew();
    });





    /*=== Todays Task Widget Functions ===*/
    function opts(){
        $(".opts > a.done").on("click",function(){
            $(this).closest(".task").toggleClass("done");
            return false;
        });

        $(".opts > a.remove-this").on("click",function(){
            $(this).closest(".task").fadeOut();
            Materialize.toast('You have successfully removed a task!', 4000);
            setTimeout(function(){
                $(".masonary").isotope('reloadItems').isotope({ sortBy:'original-order' });
            },400)
            return false;
        });
    }
    opts();


    $(".add-task").on("click",function(){
        var task_name = $("#enter-task").val();
        var task_hour = $("#task-hour").val();
        var task_period = $("#task-period").val();
        $(".tasks-list").append('<div class="task"> <span>' + task_hour + '<i>' + task_period + '</i></span> <h5>' + task_name + '</h5> <div class="opts"> <a class="green done" href="#" title=""><i class="ti-check"></i></a> <a class="red remove-this" href="#" title=""><i class="ti-close"></i></a> </div> </div> ')
        opts();
        Materialize.toast('You have successfully added a task!', 4000);
        setTimeout(function(){
            $(".masonary").isotope('reloadItems').isotope({ sortBy:'original-order' });
        },400)
    });



    /*================== Sidemenu Dropdown =====================*/
    $(".admin-nav li ul").parent().addClass("menu-item-has-children");
    $(".admin-nav ul li.menu-item-has-children > a").on("click", function() {
        $(this).parent().toggleClass("active").siblings().removeClass("active");
        $(this).next("ul").slideToggle();
        $(this).parent().siblings().find("ul").slideUp();
        return false;
    });

    /* ============ Sidemenu Button ================*/
    $(".sidemenu-btn").on("click",function(){
        $('body').toggleClass("active");
        setTimeout(function(){
            $(".masonary").isotope('reloadItems').isotope({ sortBy:'original-order' });
        },700)
        return false;
    });


    /* ============ Mailbox ================*/
    $('.select-all input').change(function() {
        if (this.checked) {
            $(".mail-list li").each(function(){
                $(this).find('input[type="checkbox"]').prop('checked', true); 
            });
        }
        else{
            $(".mail-list li").each(function(){
                $(this).find('input[type="checkbox"]').prop('checked', false); 
            });
        }
    });


    /* ============ Alert Box ================*/
    $('.alert-box a.close').on('click',function(){
        $(this).parent().fadeOut();
        return false;
    });


    /* ============ Facebook Carousel ================*/
     $('#fb-carousel').slick({
        infinite:true,
        slidesToShow:1,
        dots:false,
        autoplay:true,
        autoplaySpeed:3000,
        arrows:false,
        slidesToScroll:1
     });

    /*------------- preloader js --------------*/
    $('.loader-container').delay(500).fadeOut('slow');// will first fade out the loading animation
    $('.page-loader').delay(500).fadeOut('slow');// will fade out the white DIV that covers the website.
   
});