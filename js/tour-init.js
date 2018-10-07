
var tourSubmitFunc = function(e,v,m,f){
			if(v === -1){
				$.prompt.prevState();
				return false;
			}
			else if(v === 1){
				$.prompt.nextState();
				return false;
			}
},
tourStates = [
	{
		title: 'Welcome',
		html: 'This is the logo! Click "Next" to proceed ',
		buttons: { Next: 1 },
		focus: 0,
		position: { container: '.logo', x:10, y: 60, width: 200, arrow: 'tc' },
		submit: tourSubmitFunc
	},
	{
		title: 'Side Menu Button',
		html: 'The Sidemenu button is used to open and close the sidemenu! Click Next to Proceed',
		buttons: { Prev: -1, Next: 1 },
		focus: 1,
		position: { container: '.sidemenu-btn', x: 60, y: 0, width: 300, arrow: 'lt' },
		submit: tourSubmitFunc
	},
	{
		title: "You've Got Options",
		html: 'This is the notification panel to check all the notifications.',
		buttons: { Prev: -1, Next: 1 },
		focus: 1,
		position: { container: '.notification', x: -320, y: 0, width: 300, arrow: 'rt' },
		submit: tourSubmitFunc
	},
	{
		title: 'Launcher',
		html: 'You will find plenty of examples to get you going..',
		buttons: { Prev: -1, Next: 1 },
		focus: 1,
		position: { container: '.launcher', x:-320, y: 10, width: 300, arrow: 'rt' },
		submit: tourSubmitFunc
	},
	{
		title: 'Search Here',
		html: 'Including this tour... See, creating a tour is easy!',
		buttons: { Prev: -1, Next: 1 },
		focus: 1,
		position: { container: '.search-admin', x:0, y:60, width: 250, arrow: 'tc' },
		submit: tourSubmitFunc
	},
	{
		title: 'Congratulations',
		html: 'Congratulations! You have completed the tour successfully. Now Click "Done" to proceed. Thanks!',
		buttons: { Done: 2 },
		focus: 0,
		position: { container: '.page-title h1', x:0, y:40, width: 275, arrow: 'tc' },
		submit: tourSubmitFunc
	}
];
$.prompt(tourStates);