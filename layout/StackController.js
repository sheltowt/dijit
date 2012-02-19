define([
	"dojo/_base/array", // array.forEach array.indexOf array.map
	"dojo/_base/declare", // declare
	"dojo/dom-class",
	"dojo/_base/event", // event.stop
	"dojo/keys", // keys
	"dojo/_base/lang", // lang.getObject
	"../focus",		// focus.focus()
	"../registry",	// registry.byId
	"../_Widget",
	"../_TemplatedMixin",
	"../_Container",
	"../form/ToggleButton",
	"dojo/i18n!../nls/common"
], function(array, declare, domClass, event, keys, lang,
			focus, registry, _Widget, _TemplatedMixin, _Container, ToggleButton){

/*=====
	var _Widget = dijit._Widget;
	var _TemplatedMixin = dijit._TemplatedMixin;
	var _Container = dijit._Container;
	var ToggleButton = dijit.form.ToggleButton;
=====*/

	// module:
	//		dijit/layout/StackController
	// summary:
	//		Set of buttons to select a page in a `dijit.layout.StackContainer`

	var StackButton = declare("dijit.layout._StackButton", ToggleButton, {
		// summary:
		//		Internal widget used by StackContainer.
		// description:
		//		The button-like or tab-like object you click to select or delete a page
		// tags:
		//		private

		// Override _FormWidget.tabIndex.
		// StackContainer buttons are not in the tab order by default.
		// Probably we should be calling this.startupKeyNavChildren() instead.
		tabIndex: "-1",

		// closeButton: Boolean
		//		When true, display close button for this tab
		closeButton: false,
		
		_aria_attr: "aria-selected",

		buildRendering: function(/*Event*/ evt){
			this.inherited(arguments);
			(this.focusNode || this.domNode).setAttribute("role", "tab");
		}
	});


	var StackController = declare("dijit.layout.StackController", [_Widget, _TemplatedMixin, _Container], {
		// summary:
		//		Set of buttons to select a page in a `dijit.layout.StackContainer`
		// description:
		//		Monitors the specified StackContainer, and whenever a page is
		//		added, deleted, or selected, updates itself accordingly.

		baseClass: "dijitStackController",

		templateString: "<span role='tablist' data-dojo-attach-event='onkeypress'></span>",

		// containerId: [const] String
		//		The id of the page container that I point to
		containerId: "",

		// buttonWidget: [const] Constructor
		//		The button widget to create to correspond to each page
		buttonWidget: StackButton,

		// buttonWidgetClass: String
		//		CSS class of button widget, used by event delegation code to tell when the button was clicked
		buttonWidgetClass: "dijitToggleButton",

		// buttonWidgetCloseClass: String
		//		CSS class of [x] close icon, used by event delegation code to tell when close button was clicked
		buttonWidgetCloseClass: "dijitStackCloseButton",

		constructor: function(){
			this.pane2button = {};		// mapping from pane id to buttons
			this.pane2watches = {};		// mapping from pane id to watch() handles
		},

		postCreate: function(){
			this.inherited(arguments);

			// Listen to notifications from StackContainer
			this.subscribe(this.containerId+"-startup", "onStartup");
			this.subscribe(this.containerId+"-addChild", "onAddChild");
			this.subscribe(this.containerId+"-removeChild", "onRemoveChild");
			this.subscribe(this.containerId+"-selectChild", "onSelectChild");
			this.subscribe(this.containerId+"-containerKeyPress", "onContainerKeyPress");

			// Listen for click events to select or close tabs.
			// No need to worry about ENTER/SPACe key handling: tabs are selected via left/right arrow keys,
			// and closed via shift-F10 (to show the close menu).
			this.connect(this.containerNode, 'click', function(evt){
				var button = registry.getEnclosingWidget(evt.target),
					page = button.page;
				for(var target = evt.target; target !== this.containerNode; target = target.parentNode){
					if(domClass.contains(target, this.buttonWidgetCloseClass)){
						this.onCloseButtonClick(button);
						break;
					}else if(domClass.contains(target, this.buttonWidgetClass)){
						this.onButtonClick(button);
						break;
					}
				}
			});
		},

		onStartup: function(/*Object*/ info){
			// summary:
			//		Called after StackContainer has finished initializing
			// tags:
			//		private
			array.forEach(info.children, this.onAddChild, this);
			if(info.selected){
				// Show button corresponding to selected pane (unless selected
				// is null because there are no panes)
				this.onSelectChild(info.selected);
			}
		},

		destroy: function(){
			for(var pane in this.pane2button){
				this.onRemoveChild(registry.byId(pane));
			}
			this.inherited(arguments);
		},

		onAddChild: function(/*dijit._Widget*/ page, /*Integer?*/ insertIndex){
			// summary:
			//		Called whenever a page is added to the container.
			//		Create button corresponding to the page.
			// tags:
			//		private

			// create an instance of the button widget
			// (remove typeof buttonWidget == string support in 2.0)
			var Cls = lang.isString(this.buttonWidget) ? lang.getObject(this.buttonWidget) : this.buttonWidget;
			var button = new Cls({
				id: this.id + "_" + page.id,
				label: page.title,
				dir: page.dir,
				lang: page.lang,
				textDir: page.textDir,
				showLabel: page.showTitle,
				iconClass: page.iconClass,
				closeButton: page.closable,
				title: page.tooltip,
				page: page
			});

			// map from page attribute to corresponding tab button attribute
			var pageAttrList = ["title", "showTitle", "iconClass", "closable", "tooltip"],
				buttonAttrList = ["label", "showLabel", "iconClass", "closeButton", "title"];

			// watch() so events like page title changes are reflected in tab button
			this.pane2watches[page.id] = array.map(pageAttrList, function(pageAttr, idx){
				return page.watch(pageAttr, function(name, oldVal, newVal){
					button.set(buttonAttrList[idx], newVal);
				});
			});

			this.addChild(button, insertIndex);
			this.pane2button[page.id] = button;
			page.controlButton = button;	// this value might be overwritten if two tabs point to same container
			if(!this._currentChild){
				// If this is the first child then StackContainer will soon publish that it's selected,
				// but before that StackContainer calls layout(), and before layout() is called the
				// StackController needs to have the proper height... which means that the button needs
				// to be marked as selected now.   See test_TabContainer_CSS.html for test.
				this.onSelectChild(page);
			}
		},

		onRemoveChild: function(/*dijit._Widget*/ page){
			// summary:
			//		Called whenever a page is removed from the container.
			//		Remove the button corresponding to the page.
			// tags:
			//		private

			if(this._currentChild === page){ this._currentChild = null; }

			// disconnect/unwatch connections/watches related to page being removed
			array.forEach(this.pane2watches[page.id], function(w){ w.unwatch(); });
			delete this.pane2watches[page.id];

			var button = this.pane2button[page.id];
			if(button){
				this.removeChild(button);
				delete this.pane2button[page.id];
				button.destroy();
			}
			delete page.controlButton;
		},

		onSelectChild: function(/*dijit._Widget*/ page){
			// summary:
			//		Called when a page has been selected in the StackContainer, either by me or by another StackController
			// tags:
			//		private

			if(!page){ return; }

			if(this._currentChild){
				var oldButton=this.pane2button[this._currentChild.id];
				oldButton.set('checked', false);
				oldButton.focusNode.setAttribute("tabIndex", "-1");
			}

			var newButton=this.pane2button[page.id];
			newButton.set('checked', true);
			this._currentChild = page;
			newButton.focusNode.setAttribute("tabIndex", "0");
			var container = registry.byId(this.containerId);
			container.containerNode.setAttribute("aria-labelledby", newButton.id);
		},

		onButtonClick: function(/*dijit._Widget*/ button){
			// summary:
			//		Called whenever one of my child buttons is pressed in an attempt to select a page
			// tags:
			//		private

			// For TabContainer where the tabs are <span>, need to set focus explicitly when left/right arrow
			focus.focus(button.focusNode);

			var page = button.page;

			if(this._currentChild.id === page.id) {
				//In case the user clicked the checked button, keep it in the checked state because it remains to be the selected stack page.
				var button=this.pane2button[page.id];
				button.set('checked', true);
			}
			var container = registry.byId(this.containerId);
			container.selectChild(page);
		},

		onCloseButtonClick: function(/*dijit._Widget*/ button){
			// summary:
			//		Called whenever one of my child buttons [X] is pressed in an attempt to close a page
			// tags:
			//		private

			var page = button.page,
				container = registry.byId(this.containerId);
			container.closeChild(page);
			if(this._currentChild){
				var b = this.pane2button[this._currentChild.id];
				if(b){
					focus.focus(b.focusNode || b.domNode);
				}
			}
		},

		// TODO: this is a bit redundant with forward, back api in StackContainer
		adjacent: function(/*Boolean*/ forward){
			// summary:
			//		Helper for onkeypress to find next/previous button
			// tags:
			//		private

			if(!this.isLeftToRight() && (!this.tabPosition || /top|bottom/.test(this.tabPosition))){ forward = !forward; }
			// find currently focused button in children array
			var children = this.getChildren();
			var current = array.indexOf(children, this.pane2button[this._currentChild.id]);
			// pick next button to focus on
			var offset = forward ? 1 : children.length - 1;
			return children[ (current + offset) % children.length ]; // dijit._Widget
		},

		onkeypress: function(/*Event*/ e){
			// summary:
			//		Handle keystrokes on the page list, for advancing to next/previous button
			//		and closing the current page if the page is closable.
			// tags:
			//		private

			if(this.disabled || e.altKey ){ return; }
			var forward = null;
			if(e.ctrlKey || !e._djpage){
				switch(e.charOrCode){
					case keys.LEFT_ARROW:
					case keys.UP_ARROW:
						if(!e._djpage){ forward = false; }
						break;
					case keys.PAGE_UP:
						if(e.ctrlKey){ forward = false; }
						break;
					case keys.RIGHT_ARROW:
					case keys.DOWN_ARROW:
						if(!e._djpage){ forward = true; }
						break;
					case keys.PAGE_DOWN:
						if(e.ctrlKey){ forward = true; }
						break;
					case keys.HOME:
					case keys.END:
						var children = this.getChildren();
						if(children && children.length){
							this.onButtonClick(children[e.charOrCode == keys.HOME ? 0 : children.length-1]);
						}
						event.stop(e);
						break;
					case keys.DELETE:
						if(this._currentChild.closable){
							this.onCloseButtonClick(this.pane2button[this._currentChild.id]);
						}
						event.stop(e);
						break;
					default:
						if(e.ctrlKey){
							if(e.charOrCode === keys.TAB){
								this.onButtonClick(this.adjacent(!e.shiftKey));
								event.stop(e);
							}else if(e.charOrCode == "w"){
								if(this._currentChild.closable){
									this.onCloseButtonClick(this.pane2button[this._currentChild.id]);
								}
								event.stop(e); // avoid browser tab closing.
							}
						}
				}
				// handle next/previous page navigation (left/right arrow, etc.)
				if(forward !== null){
					this.onButtonClick(this.adjacent(forward));
					event.stop(e);
				}
			}
		},

		onContainerKeyPress: function(/*Object*/ info){
			// summary:
			//		Called when there was a keypress on the container
			// tags:
			//		private
			info.e._djpage = info.page;
			this.onkeypress(info.e);
		}
	});

	StackController.StackButton = StackButton;	// for monkey patching

	return StackController;
});
