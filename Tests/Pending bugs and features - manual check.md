#### **Bugs**



###### **New**

* &#x09;



###### **Fix in progress**

* 



###### **Fixed pending validation**

* 



###### **Fixed and verified**

* Provider sent "what about reducing the cleaning time" message to customer. Bell icon correctly showed 1 new message. Clicked on it and it took me to the end of the chat, but new message was not there yet. Had to refresh the screen to see it
* Any notification you click on should be marked as read
* Book Service: address validation and auto-completion 
* The "My requests" and "Received quotes" tabs are confusing. Quotes always have a request attached to it, so it doesn't make sense to show them separately. Each request should have their "received quotes" feature. Also, it's confusing there's no way to get to request/quotes screen if not from Messages. In fact, it looks like both should somehow be folded into the "bookings" option. Think hard on how to refactor this feature(s) ensuring smooth, intuitive CX. Ask me any questions before you proceed.
* Profile Settings: Account Actions buttons are misaligned; notificationssettings takes to a screen that's not possible to come back from; didn't test change password or delete my account, pls do it; same for profile visibility
* Notification not getting to quote when clicked on Logged as Demo Cliente, clicked on the 2nd notification from the top, didnot scroll down or select the quote.
* Profile Settings look weird on mobile when set to PT (buttons at the top overflowing to the right). In fact, the screen buttons and style look weird and not aligned to the rest of the app. Think hard of how to refactor it, ask any questions before you proceed
* Home Screen has "Popular Services", but any of them take to the AI mode. I think that's fine, but the watermark message should exemplify that service. Alternatively, it should go to "browse and filter" with that option selected. Thoughts?
* When in PT, also convert units (miles to KM for example). New request still shows in miles
* Broadcast: only providers able for that service and within the distance radius should receive the quote request
* pls create an awaiting quotes booking with multiple quotes, I'd like to see the CX
* Notifications: some events have duplicate notifications (see client's quote acceptance for Demo Provider)
* Direct booking: reuse the original service's address
* when you get a notification of a new message, the actual notification is not yet in the list, unless if you click on refresh.
* It should be able to exchange messages from the moment the client accepts the quote
* When clicking on "new quote received" from messages, it's not taking to that quote
* On mobile CX, menu bar at the bottom does not update on language change
* Review CX in mobile mode. Some buttons look awkward, with labels overflowing them (like "Request quote")
* label "list.results\_count\_plural" not set in "my bookings
* When logging in/out using different roles, the messages list do not update (i.e. you see previous session's list) unless you click on "refresh".
* Notification headlines, in the bell icon, showing in English (new message, new quote request) even if select language is PT (logged as Demo provider)
* when attaching a jpeg file, it just shows a "attachment" message blurb, but you can't see or download the file. Clicking on it takes you back to the home screen
* File upload in messages is timing out
* Notification settings / notification preferences: says those are managed through the notification center settings. But well, that's the notification center settings, right? Also there's a tip saying "Tip: You can customize email, SMS, and push notification preferences for different types of notifications including bookings, payments, reviews, and messages." Where is that?
* Notification tabs for filtering (unread, bookings, payments, etc) not working. On that screen there's a cog (settings), that pops up emal, sms and push notifications, but nothing is shown. These should be all in the notification preferences tab. It's super confusing and incomplete. Think hard on how to fix this
* Add seed data for notifications, all types
* My Bookings: clicking on Message from a booking widget STILL takes to the incorrect conversation in the Message screen. For xample, try "Instaload De TV Na Parede" for user Demo, and it will land on "Jardinagem Service" discussion
* Memories are in english, even having been generated in Portuguese (current setting)
* Couldn't test if Clicking on notifications in the bell icon is taking to the specific booking. Submitted a quote for "Encanamento - Desentupimento De Privada", but it did not show up in the Demo customer notification
* "Best for" in widgets STILL displayed after the AI lookup, even if selected language is PT
* Location is showing the city, instead of neighborhood (that should be extracted in the aI mode)
* The big, round button "adicionar ao orcamento" still looks weird. Maybe replace it by a checkbox, and change label to "solicitar orcamento"
* That and "See Profile" buttons change size depending on the provider widget. If you use the prompt "preciso de um encanador pro proximo sabado 10am no itacorobi, pra desentupir uma privada. ORcamento 300 reais" you will see it
* "see profile" does not do anything
* elements have not been i18ned
* The "Search and filter" tab is still active, even after completing the AI mode. Do you remember what was asked? "ultimately, the screen resulting in the AI mode and the manual search should look the same. It's like the AI mode just helped populate the fields needed for that search. However, the manual search does not seem to have all elements needed. And once the AI mode is completed, but manual search tab should disappear, because as said above they will have exactly the same fields and the AI results are editable. Ask any questions if not clear"
* still getting "request failed with request code 400"
* AI mode fixed in PT (no changing to EN)
* clicking on the notifications from the bell icon at the top takes to the home screen
* AI mode keeps interacting in PT, even if you change the language to EN
* Confirmation message after request code is "Pedido de orçamento enviado para {{count}} profissional(is)!"
* \[provider] Clicking on "this quarter" gets error 400. All other period buttons are not working (no action)





###### **Not fixed/accepted bugs**

* Service Types still showing in PT even if EN is selected. This is not static list, and is domain specific. No neat way to do it, other than adding Locale translation when adding new services



#### **New/improved features**

* 



#### **Prompts**

* need a plumber for next saturday 10am in Itacorobi to unblock a toilet bowl. Budget is 100 bucks
* preciso de um encanador pro proximo sabado 10am no itacorobi, pra desentupir uma privada. ORcamento 300 reais

