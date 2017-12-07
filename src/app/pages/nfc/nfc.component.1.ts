import { ToasterConfigService } from './../../providers/toaster.service';
import { NfcService } from './../../providers/nfc/nfc.service';
import { Component, OnInit, Input, NgZone, ChangeDetectorRef } from '@angular/core';
import { Subscription } from 'rxjs/Subscription';

import { ToasterService, ToasterConfig, Toast, BodyOutputType } from 'angular2-toaster';
import 'style-loader!angular2-toaster/toaster.css';

import { trigger, state, style, transition, animate, keyframes } from '@angular/animations';

@Component({
  selector: 'ngx-nfc',
  styleUrls: ['./nfc.component.scss'],
  templateUrl: './nfc.component.html',
  animations: [
    trigger('fadeIn', [
      transition(':enter', [
        style({ opacity: '0' }),
        animate('.5s ease-out', style({ opacity: '1' })),
      ]),
      transition(':leave', [
        style({ opacity: '1' }),
        animate('.5s ease-in', style({ opacity: '0' })),
      ]),
    ]),
  ]
})

export class NfcComponentSAVE implements OnInit {
  cardContent: any;
  cardContentObject: { pin: any; securityTransportCompany: any; bankName: any; appVersion: any; };
  cardMessageUnknowFormatArray: any;

  toasterConfig: ToasterConfig;
  nfcThread: Subscription;
  currentAction: string;
  nfcStatusLoading: boolean;
  nfc: any; // global obj
  writtenCardsCount: number;

  clients: any[];
  selectedClient: { id: number; name: string; };

  readOrWriteMode: string = 'read';

  @Input()
  public alerts: Array<IAlert> = [];

  private backup: Array<IAlert>;

  constructor(public nfcS: NfcService, private toasterService: ToasterService, public toasterConfigService: ToasterConfigService,
    public ngZone: NgZone, private ref: ChangeDetectorRef) {
    console.log('NFC page loaded.');

  }

  ngOnInit() {
  }


  ngAfterViewInit () {

    this.nfcS.init(); // init service (finds a reader, wait for a card.)
    this.nfcS.setMode(this.readOrWriteMode); // set read/write mode to default @init


    this.cardContentObject = {
      pin: null,
      securityTransportCompany: null,
      bankName: null,
      appVersion: null
    }
    this.cardContent = this.cardContentObject;
    /**
     * Init:
     * 0- Get client list
     * 1- Init NFC, check status
     */
    // @TODO: tcp request here
    setTimeout(() => {
      this.clients = [
        {id: 1, name: 'a'},
        {id: 2, name: 'b'},
        {id: 3, name: 'c'},
        {id: 4, name: 'd'},
        {id: 5, name: 'e'}
      ];
      this.selectedClient =  this.clients[0];
    }, 1000);

    this.writtenCardsCount = 0;
    this.nfcStatusLoading =  true;


    this.currentAction = '-';


    /**
     * Main NFC Thread
     */
    this.nfcThread = this.nfcS.data.subscribe(
      nfcService$ =>
        this.nfcManager(nfcService$),
        // console.log('nfcService$', nfcService$),
      error => console.log('e', error),
      () => console.log('nfc end.')
    );

  }


  /**
   * @method ncfManager
   * @description manages values received from the main observable *nfcThread*
   *
   * @param {any} globalNfcObject 'nfc global object'
   * @memberof NfcComponent
   */
  nfcManager(nfcService$) {

    // Hey, something new happened !
    this.nfc = nfcService$;
    console.log('Got a new value:', nfcService$, this.nfc);

    // ??!
    // https://stackoverflow.com/questions/38445670/angular-2-view-will-not-update-after-variable-change-in-subscribe
    // this.ngZone.run(() => {
    //   this.nfc = this.nfc;
    // });
    // this.ref.markForCheck();

    // What's new happened ? card read, card write ? Reader appears, reader disappeared ?
    switch (nfcService$.description) {
      case 'action':

        //@TODO: reinit the nfc reader when a successful action is done

        // We've got a new action, let's reset the view in order to show the steps following the action to the user
        this.resetViewObjects();
        console.log('NFCSERVICE', nfcService$)
        // It's a card read
        if (nfcService$.action.cardRead) {

          this.alerts.push({ type: 'light', message: 'A card ha s been found (uid:' + nfcService$.cardUid + ' - type:' + nfcService$.cardType + ')'});

          // SUCCESS: Card has been read and ndef message has been parsed successfully
          if (nfcService$.success) {
            this.alerts.push({ type: 'success', message: 'Read a card successfully'});
            this.alerts.push({ type: 'light', message: 'DEBUG: ' + JSON.stringify(nfcService$.readResult.ndefMessage)});

            // ndef parser lib returns an array containing any records in the message
            const cardMessageArray = nfcService$.readResult.ndefMessage // isArray true

            // Our record should be the first: index 0
            // We verify if our object contains all the properties we defined (in this.cardContent)
            const resultAsJSONIsVerified = this.verifyObjectValidity(cardMessageArray[0]);

            // Our object is valid (contains our props: eg. pin, transportname, bank etc...), we can work with it.
            if (resultAsJSONIsVerified.success) {
              this.alerts.push({ type: 'success', message: 'Parsed card content successfully. See the result below.' });

              // Fill the cardContent object, it will show the grid with these infos to the user
              this.cardContent = cardMessageArray[0];

            // result does not contains our pre-defined properties
            } else if (resultAsJSONIsVerified.error) {
              this.alerts.push({ type: 'warning', message: 'The card contains readable information but not the one we expect. You can find the card parsing below anyway.' });              
              this.cardMessageUnknowFormatArray = cardMessageArray;
            }

          }

          // ERROR: Card ndef message could not be read or parse
          if (nfcService$.error) {

            // Default behavior for any error: Tell the user, show the raw data for debug
            this.alerts.push({ type: 'warning', message: 'Something wrong happened while reading or parsing card (' + nfcService$.errorDesc + ')'});
            this.alerts.push({ type: 'light', message: 'Raw Data (debug):' + nfcService$.readResult}); // raw result for debug


          }
        } // cardRead
        if (nfcService$.action.cardRead) {
          console.log(nfcService$.writeResult)
        }
      break;

      case 'nfcGlobalStatus':
      console.log('nfcGlobalStatus');
      break;

      case 'error':
        console.log('error', nfcService$.errorType, nfcService$.errorDesc);

        // Parse error
        if (nfcService$.errorDesc === 'Not a WELL_KNOWN text record') {

          // This error should trigger a view reset as it's only a parse error
          this.resetViewObjects();

          this.alerts.push({ type: 'light', message: 'Trying to parse manually the card' });

          // We try to parse a JSON object from the utf8 string by isolating what's between {*}
          const resultFromJSONParseTry = this.tryRegExpJSONParsing(nfcService$.readResult.utf8);
          if (resultFromJSONParseTry.success) {

            // it's a success, we verify if our object contains all the properties we defined (in this.cardContent)
            const resultAsJSONIsVerified = this.verifyObjectValidity(resultFromJSONParseTry.result);
            // Our object is valid, we can work with it.
            if (resultAsJSONIsVerified.success) {
              this.alerts.push({ type: 'success', message: 'Parsed card content successfully. See the result below.' });

              // Fill the cardContent object, it will show the grid with these infos to the user
              this.cardContent = resultFromJSONParseTry.result;

            // result is a valid JSON object, but does not contains our pre-defined properties
            } else if (resultAsJSONIsVerified.error) {
              console.log('ISVALIDJSON with UNKNOWNPROPS', resultFromJSONParseTry.result)
              this.cardMessageUnknowFormatArray = resultFromJSONParseTry.result;
            }
            // parsing failed, tell the user the card is not readable as is
          } else if (resultFromJSONParseTry.error) {
            this.alerts.push({ type: 'danger', message: 'Unable to parse card content, please rewrite the card from scratch' });
          }
        }

      break;
    }
    // // something wrong happened
    if (nfcService$.error) {
      console.error('Global Error', nfcService$)
      if (nfcService$.errorDesc !== 'Not a WELL_KNOWN text record') {
        this.showToast('error', 'Error', nfcService$.errorType + ' - ' + nfcService$.errorDesc);
      }
      // this.nfc.error = null;
      this.nfcS.init();
    }
  }


  /**
   * @method showToast
   * @description show a toast on the top-right corner
   *
   * @private
   * @param {string} type 'error, success, info, warning...'
   * @param {string} title 'a title'
   * @param {string} body 'body of the message to be shown'
   * @memberof NfcComponent
   */
  private showToast(type: string, title: string, body: string) {
    this.toasterConfig = this.toasterConfigService.getConfig();
    const toast: Toast = this.toasterConfigService.getToast(title, body)
    this.toasterService.popAsync(toast);
  }

  closeAlert(alert: IAlert) {
    const index: number = this.alerts.indexOf(alert);
    this.alerts.splice(index, 1);
  }


  /**
   * @method getValueToWrite
   * @description Build a serialized JSON object containing all the values to write on the card
   * @example       let data = {pin: "U2FsdGVkX19Buxk/sTWmdXFrfCgNsfmxJOqTvoJxW4kHS7+phRSqIegFb//zXmREjZLsaEK2RqIpBMyihlUuA48V6FQGvLyCPz948b5zv3Y=", securityTransportCompany: "Masdria", bankName: "The Saudi British Bank", appVersion: "1.0.0"};
   *
   * @memberof NfcComponent
   */
  getValueToWrite() {
    const valueToWrite = {pin: 'U2FsdGVkX19Buxk/sTWmdXFrfCgNsfmxJOqTvoJxW4kHS7+phRSqIegFb//zXmREjZLsaEK2RqIpBMyihlUuA48V6FQGvLyCPz948b5zv3Y=', securityTransportCompany: 'Masdria', bankName: 'The Saudi British Bank', appVersion: '1.0.0'};
    return valueToWrite;
  }

  readCard() {
    this.readOrWriteMode = 'read';
    this.nfcS.setMode(this.readOrWriteMode);
  }
  writeCard() {
    this.readOrWriteMode = 'write';
    this.nfcS.setMode(this.readOrWriteMode);
    this.nfcS.setValueToWrite(this.getValueToWrite());
  }

    /**
     * @method tryRegExpJSONParsing
     * @description @methodtryJSONParsing failed,
     *      we try to regexp the string by searching what could be between braces {*}
     *      if it succeed, we try to parse JSON
     *
     * @param {any} resultString
     * @returns {object} '(result as json) + status'
     * @memberof NfcComponent
     */
    tryRegExpJSONParsing(resultString) {
      const bracesIsolatedStr = resultString.match(/{(.*?)\}/);

      try {
        const resultAsJson = JSON.parse(bracesIsolatedStr[0]);
        return {
          success: true,
          error: false,
          result: resultAsJson
        }
      } catch (e) {
        return {
          success: false,
          error: true,
          result: null
        }
      }
    }

    verifyObjectValidity(resultAsJson) {
      for (const property in this.cardContentObject) {

        if (!resultAsJson.hasOwnProperty(property)) {
          console.log('Did not found property: "' + property + '" in object:', resultAsJson)
          // ERROR: missing property
          return {
            success: false,
            error: true,
            result: null
          }
        } else {
          // SUCCESS: all properties are here
          return {
            success: true,
            error: false,
            result: resultAsJson
          }
        }

      }

    }
    /**
     * @method resetViewObject
     * @description resets the view (empty it) by settings object bound to view to default
     *      - message array
     *      - cardContent object
     *
     * @memberof NfcComponent
     */
    resetViewObjects() {
      this.alerts = [];
      this.cardContent = this.cardContentObject;
      this.cardMessageUnknowFormatArray = [];
    }
}


export interface IAlert {
  type: string;
  message: string;
}